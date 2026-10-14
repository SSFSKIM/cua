// The injected script's installation (src/browser-service/injected.mjs, the vendor's Pf install half): Playwright's
// InjectedScript lives in the isolated world `cua-browser-injected` of each frame it is used in, never in the page's own
// world; it is installed on first use, again after the frame's document changes (a navigation event, or a context
// found gone), and every CDP call carries the command's Deadline. Driven through the real CdpController over a fake
// Chrome whose worlds run the expressions in node:vm (support/page-world.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {Deadline} from '../../src/browser-service/budgets.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {HELPER_MISSING, INJECTED_GLOBAL, InjectedScripts, WORLD_NAME, installExpression, pageError} from '../../src/browser-service/injected.mjs';
import {FAKE_INJECTED_SOURCE, el, iframe, pageWorld} from './support/page-world.mjs';

const TAB = 7;
const MAIN = `MAIN-${TAB}`;
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

function setup(elements = [el('p', {id: 'hello', text: 'Hello'})]) {
  const {api, browser} = pageWorld();
  browser.tab(TAB, {elements});
  const cdp = new CdpController(api);
  const injected = new InjectedScripts(cdp, {source: FAKE_INJECTED_SOURCE});
  return {api, browser, cdp, injected};
}

const title = `window.${INJECTED_GLOBAL}.document.body.children[0].textContent`;
const isInstall = call => call.method === 'Runtime.evaluate' && call.params.expression.includes('PlaywrightInjected.InjectedScript');
const setupCalls = browser => browser.calls.filter(c => c.op === 'executeCdp')
  .map(c => (isInstall(c) ? 'install' : c.method))
  .filter(m => !['Emulation.setFocusEmulationEnabled', 'Page.enable', 'Target.setAutoAttach'].includes(m));

test('first use: the main frame\'s isolated world cua-browser-injected is made, the script installed there, then the expression runs there', async () => {
  const {browser, injected} = setup();
  assert.equal(WORLD_NAME, 'cua-browser-injected');
  assert.equal(await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline: new Deadline(2000)}), 'Hello');
  assert.deepEqual(setupCalls(browser), ['Page.getFrameTree', 'Page.createIsolatedWorld', 'install', 'Runtime.evaluate']);
  const world = browser.calls.find(c => c.method === 'Page.createIsolatedWorld');
  assert.deepEqual(world.params, {frameId: MAIN, worldName: WORLD_NAME, grantUniveralAccess: false});
  const context = browser.world(MAIN, WORLD_NAME);
  for (const call of browser.calls.filter(c => c.method === 'Runtime.evaluate')) assert.equal(call.params.contextId, context.id, 'every evaluation is in the isolated world');
  assert.equal(typeof context.global[INJECTED_GLOBAL].parseSelector, 'function');
  assert.equal(browser.world(MAIN, ''), undefined, 'the page\'s own world was never touched');
});

test('later uses evaluate only; a main-frame navigation makes the next use reinstall without asking for the frame tree again', async () => {
  const {browser, injected} = setup();
  const deadline = new Deadline(2000);
  await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline});
  browser.calls.length = 0;
  assert.equal(await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline}), 'Hello');
  assert.deepEqual(setupCalls(browser), ['Runtime.evaluate']);
  browser.navigate(MAIN, {elements: [el('p', {text: 'Next page'})]});
  browser.calls.length = 0;
  assert.equal(await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline}), 'Next page');
  assert.deepEqual(setupCalls(browser), ['Page.createIsolatedWorld', 'install', 'Runtime.evaluate']);
});

test('a child frame\'s navigation reinstalls in that frame only', async () => {
  const {browser, injected} = setup([iframe({id: 'f', frame: {id: 'CHILD', url: 'https://fixture.test/child', elements: [el('p', {text: 'child'})]}})]);
  const deadline = new Deadline(2000);
  await injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline});
  await injected.evaluateValue({tabId: TAB}, 'CHILD', title, {deadline});
  browser.navigate('CHILD', {elements: [el('p', {text: 'child two'})]});
  browser.calls.length = 0;
  await injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline});
  assert.deepEqual(setupCalls(browser), ['Runtime.evaluate'], 'the main frame kept its world');
  assert.equal(await injected.evaluateValue({tabId: TAB}, 'CHILD', title, {deadline}), 'child two');
  assert.deepEqual(setupCalls(browser), ['Runtime.evaluate', 'Page.createIsolatedWorld', 'install', 'Runtime.evaluate']);
});

test('a world found gone (no event) is made again and the evaluation retried once; a missing helper likewise', async () => {
  const {browser, injected} = setup();
  const deadline = new Deadline(2000);
  await injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline});
  browser.destroyContexts(MAIN);
  browser.calls.length = 0;
  assert.equal(await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline}), 'Hello');
  assert.deepEqual(setupCalls(browser), ['Runtime.evaluate', 'Page.createIsolatedWorld', 'install', 'Runtime.evaluate']);

  vm.runInContext(`delete window.${INJECTED_GLOBAL}`, browser.world(MAIN, WORLD_NAME).context);
  browser.calls.length = 0;
  assert.equal(await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline}), 'Hello');
  assert.deepEqual(setupCalls(browser), ['Runtime.evaluate', 'Runtime.releaseObject', 'Page.createIsolatedWorld', 'install', 'Runtime.evaluate']);
  assert.equal(browser.objects.size, 0, 'the failed attempt\'s exception object was released');

  // Lost twice in a row: the second failure is the caller's.
  browser.fail('Runtime.evaluate', 'Cannot find context with specified id', 2);
  const error = await rejection(injected.evaluateValue({tabId: TAB}, undefined, title, {deadline}));
  assert.match(error.message, /Cannot find context/);
});

test('a page exception is the vendor\'s sentence; an expression that is not about the world is not retried', async () => {
  const {browser, injected} = setup();
  const deadline = new Deadline(2000);
  await injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline});
  browser.calls.length = 0;
  const error = await rejection(injected.evaluateValue({tabId: TAB}, undefined, 'missing.call()', {deadline}));
  assert.equal(error.message, 'Browser Use encountered an error interacting with this webpage: ReferenceError: missing is not defined');
  assert.deepEqual(setupCalls(browser), ['Runtime.evaluate', 'Runtime.releaseObject'], 'the exception\'s objects released, nothing retried');
  assert.equal(browser.objects.size, 0);
  assert.equal(pageError({result: {}}), null);
  assert.equal(pageError({exceptionDetails: {text: 'Uncaught'}}).message, 'Browser Use encountered an error interacting with this webpage: Uncaught');
});

test('every call carries the command\'s remaining budget; none is dispatched once it is spent', async () => {
  const {browser, injected} = setup();
  const deadline = new Deadline(1500);
  await injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline});
  for (const call of browser.calls.filter(c => c.op === 'executeCdp')) {
    assert.ok(call.timeoutMs > 0 && call.timeoutMs <= 1500, `${call.method} carried ${call.timeoutMs}`);
  }
  const evaluation = browser.calls.filter(c => c.method === 'Runtime.evaluate').at(-1);
  assert.ok(evaluation.params.timeout > 0 && evaluation.params.timeout <= 1500, 'the in-page run is bounded too');
  browser.calls.length = 0;
  const error = await rejection(injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline: new Deadline(0)}));
  assert.equal(error.code, 'timeout');
  assert.equal(error.message, 'Playwright selector deadline exceeded', 'the locator engine\'s own sentence (Je), as the vendor\'s');
  assert.deepEqual(setupCalls(browser), []);
});

test('an open dialog refuses the evaluation with dialog_open, unretried', async () => {
  const {browser, cdp, injected} = setup();
  await injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline: new Deadline(2000)});
  browser.event({tabId: TAB}, 'Page.javascriptDialogOpening', {type: 'alert', message: 'hi', url: 'https://fixture.test/'});
  assert.equal(cdp.dialogs.current(TAB).type, 'alert');
  browser.calls.length = 0;
  const error = await rejection(injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline: new Deadline(2000)}));
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'dialog_open');
  assert.deepEqual(setupCalls(browser), []);
});

test('a detached tab forgets its worlds', async () => {
  const {browser, cdp, injected} = setup();
  const deadline = new Deadline(2000);
  await injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline});
  await cdp.detach(TAB);
  browser.calls.length = 0;
  await injected.evaluateValue({tabId: TAB}, undefined, '1', {deadline});
  assert.deepEqual(setupCalls(browser), ['Page.getFrameTree', 'Page.createIsolatedWorld', 'install', 'Runtime.evaluate']);
});

test('the install expression over the vendored Playwright script defines the injected script with the credential check, once', () => {
  const noop = () => {};
  const window = {document: {addEventListener: noop, removeEventListener: noop}, addEventListener: noop, removeEventListener: noop,
    MutationObserver: class { observe() {} disconnect() {} }};
  window.window = window;
  const context = vm.createContext(window);
  const expression = installExpression();
  assert.ok(expression.includes(readFileSync(new URL('../../src/browser-service/vendor/injected-script.js', import.meta.url), 'utf8')));
  vm.runInContext(expression, context);
  const injected = window[INJECTED_GLOBAL];
  assert.equal(injected.parseSelector('#a').parts[0].name, 'css');
  vm.runInContext(expression, context);
  assert.equal(window[INJECTED_GLOBAL], injected, 'a second install keeps the instance (and its aria refs)');
  const field = (tag, attrs) => ({tagName: tag, getAttribute: name => attrs[name] ?? null});
  assert.equal(injected.isProtectedCredentialField(field('INPUT', {type: 'password'})), true);
  assert.equal(injected.isProtectedCredentialField(field('INPUT', {type: 'hidden'})), true);
  assert.equal(injected.isProtectedCredentialField(field('INPUT', {name: 'user_email'})), true);
  assert.equal(injected.isProtectedCredentialField(field('INPUT', {name: 'city'})), false);
  assert.equal(injected.isProtectedCredentialField(field('DIV', {type: 'password'})), false);
  assert.equal(HELPER_MISSING, 'Browser Use Playwright injected helper is missing');
});

test('a navigation while the first world is being made does not leave its dead context in use', async () => {
  const {browser, injected} = setup([el('p', {text: 'old'})]);
  browser.after('Page.createIsolatedWorld', () => browser.navigate(MAIN, {elements: [el('p', {text: 'new'})]}));
  const started = Date.now();
  assert.equal(await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline: new Deadline(2000)}), 'new');
  assert.ok(Date.now() - started < 500);
  assert.ok(browser.cdpCalls().filter(m => m === 'Page.createIsolatedWorld').length >= 2, 'the world was made again for the new document');
  browser.calls.length = 0;
  assert.equal(await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline: new Deadline(2000)}), 'new');
  assert.deepEqual(setupCalls(browser), ['Runtime.evaluate'], 'and kept once made outside the race');
});

test('a world lost while the script is installed is made again: the next use succeeds, and a polling caller recovers', async () => {
  const {browser, injected} = setup();
  browser.after('Page.createIsolatedWorld', () => browser.destroyContexts(MAIN));
  assert.equal(await injected.evaluateValue({tabId: TAB}, undefined, title, {deadline: new Deadline(2000)}), 'Hello');
  assert.equal(browser.objects.size, 0);
  const {SelectorEngine} = await import('../../src/browser-service/selectors.mjs');
  const {browser: other, injected: fresh} = setup([el('p', {id: 'go', text: 'Go'})]);
  other.after('Page.createIsolatedWorld', () => other.navigate(MAIN, {elements: [el('p', {id: 'go', text: 'Go'})], silent: true}));
  const handle = await new SelectorEngine(fresh.cdp, fresh).resolve('#go', TAB, {deadline: new Deadline(2000)});
  assert.ok(handle.backendNodeId > 0);
});
