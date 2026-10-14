// The locator actions (src/browser-service/actions.mjs, the action half of the vendor's Pf and its commands): each
// action waits for its element's states (visible, enabled, editable) by polling the selector until its budget, scrolls
// it into view and waits for a stable box, checks that no other element covers an out-of-process frame on the way,
// then sends Input events at the element's centre; fills and typing go in by paste, keys by the keyboard, and the
// vendor's sentences come back for each refusal. Over the real controller, injected-script installer and selector
// engine against the fake Chrome of support/page-world.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTION_HANDLERS} from '../../src/browser-service/actions.mjs';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {Clipboard} from '../../src/browser-service/clipboard.mjs';
import {Cursor} from '../../src/browser-service/cursor.mjs';
import {DocumentResponses, Downloads} from '../../src/browser-service/downloads.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {InjectedScripts} from '../../src/browser-service/injected.mjs';
import {CuaInput} from '../../src/browser-service/input.mjs';
import {ENTER_FRAME, SelectorEngine} from '../../src/browser-service/selectors.mjs';
import {FAKE_INJECTED_SOURCE, el, iframe, pageWorld} from './support/page-world.mjs';

const TAB = 6;
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

// `slow(request)` -> extra ms before the fake page answers a call (a page that takes its time).
function setup(elements, {onInput, slow} = {}) {
  const {api, browser} = pageWorld();
  browser.tab(TAB, {elements});
  const pastes = [];
  const execute = api.executeCdp;
  api.executeCdp = async (request, options) => {
    const {method, commandParams: params} = request;
    // The paste page function needs a real DOM (paste.test.mjs runs it); here its call is recorded and answered.
    if (method === 'Runtime.evaluate' && params.expression.includes('const pageFunction')) {
      browser.calls.push({op: 'executeCdp', target: request.target, method, params});
      pastes.push({target: request.target, contextId: params.contextId, args: JSON.parse(params.expression.match(/await pageFunction\((.*)\);\n/)[1])});
      return {result: {type: 'object', value: {ok: true, data: {}}}};
    }
    browser.dispatchedAt ??= [];
    browser.dispatchedAt.push({method, at: Date.now()});
    const extra = slow?.(request) ?? 0;
    const answering = (async () => {
      if (extra > 0) await new Promise(resolve => setTimeout(resolve, extra));
      return await execute(request, options);
    })();
    // As the backend does: a call is abandoned when its deadline passes (backend.mjs Backend.request).
    const answer = options?.deadline ? await options.deadline.race(answering) : await answering;
    if (method.startsWith('Input.')) onInput?.(request.target, params);
    return answer;
  };
  const cdp = new CdpController(api);
  const injected = new InjectedScripts(cdp, {source: FAKE_INJECTED_SOURCE});
  const moves = [];
  const cursor = new Cursor({async moveMouse(params) { moves.push(params); return {}; }});
  const session = {cdp, injected, selectors: new SelectorEngine(cdp, injected), cursor, clipboard: new Clipboard(), platform: 'linux',
    tabs: {get: async id => ({id, url: 'https://fixture.test/'})}};
  session.input = new CuaInput(cdp, cursor, null, {platform: 'linux'});
  const run = (type, params) => ACTION_HANDLERS[type]({browser_id: 'b', tab_id: String(TAB), ...params}, session);
  const input = method => browser.calls.filter(c => c.method === method);
  const mouse = () => input('Input.dispatchMouseEvent').map(c => c.params);
  const keys = () => input('Input.dispatchKeyEvent').map(c => `${c.params.type} ${c.params.key}`);
  const node = id => [...browser.frame(`MAIN-${TAB}`).document.descendants()].find(e => e.id === id);
  return {api, browser, session, run, mouse, keys, input, moves, pastes, node};
}

test('click scrolls the element into view, then presses and releases at its centre, the cursor aimed there first', async () => {
  const {run, mouse, moves, node} = setup([el('button', {id: 'go', text: 'Go', rect: {left: 40, top: 100, width: 80, height: 20}})]);
  assert.deepEqual(await run('playwright_locator_click', {selector: '#go'}), {});
  assert.deepEqual(mouse(), [
    {type: 'mouseMoved', x: 80, y: 110, button: 'none', buttons: 0, modifiers: 0},
    {type: 'mousePressed', x: 80, y: 110, button: 'left', buttons: 1, clickCount: 1, modifiers: 0},
    {type: 'mouseReleased', x: 80, y: 110, button: 'left', buttons: 0, clickCount: 1, modifiers: 0},
  ]);
  assert.deepEqual(moves, [{tabId: TAB, x: 80, y: 110}]);
  assert.deepEqual({...node('go').scrolls[0]}, {block: 'center', inline: 'nearest', behavior: 'instant'});
});

test('dblclick presses twice; button and modifiers are the caller\'s', async () => {
  const {run, mouse} = setup([el('button', {id: 'go'})]);
  await run('playwright_locator_dblclick', {selector: '#go'});
  assert.deepEqual(mouse().map(e => `${e.type} ${e.clickCount ?? ''}`.trim()), ['mouseMoved', 'mousePressed 1', 'mouseReleased 1', 'mousePressed 2', 'mouseReleased 2']);
  const other = setup([el('button', {id: 'go'})]);
  await other.run('playwright_locator_click', {selector: '#go', button: 'right', modifiers: ['Shift', 'ControlOrMeta']});
  assert.deepEqual(other.mouse()[1], {type: 'mousePressed', x: 160, y: 95, button: 'right', buttons: 2, clickCount: 1, modifiers: 10});
});

test('a click waits for its element to become enabled, within the caller\'s budget, which may exceed 3 s', async () => {
  const {run, mouse, node} = setup([el('button', {id: 'late', disabled: true})]);
  setTimeout(() => { node('late').disabled = false; }, 400);
  await run('playwright_locator_click', {selector: '#late', timeout_ms: 5000});
  assert.equal(mouse().length, 3);
});

test('a click that never becomes possible times out with the vendor\'s sentence; force skips the states', async () => {
  const {run, mouse} = setup([el('button', {id: 'off', disabled: true})]);
  const started = Date.now();
  const error = await rejection(run('playwright_locator_click', {selector: '#off', timeout_ms: 400}));
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'timeout');
  // Which sentence ends the polling depends on where the budget runs out (the vendor's loop has the same two).
  assert.match(error.message, /^(Playwright selector deadline exceeded|Timed out after 400ms waiting for selector #off: Browser Use encountered an error interacting with this webpage: Error: Element is not enabled)$/);
  assert.ok(Date.now() - started < 1500);
  assert.equal(mouse().length, 0);
  await run('playwright_locator_click', {selector: '#off', force: true});
  assert.equal(mouse().length, 3);
});

test('an element without a box is not clicked; a missing one is waited for', async () => {
  const {run} = setup([el('span', {id: 'flat', rect: {left: 0, top: 0, width: 0, height: 0}})]);
  const flat = await rejection(run('playwright_locator_click', {selector: '#flat', timeout_ms: 300, }));
  assert.match(flat.message, /^(Playwright selector deadline exceeded|Timed out after 300ms waiting for selector #flat: .*Element does not have a clickable bounding box)$/);
  const once = await rejection(run('playwright_locator_click', {selector: '#flat', timeout_ms: 0}));
  assert.equal(once.message, 'Timed out after 0ms waiting for selector #flat: Browser Use encountered an error interacting with this webpage: Error: Element does not have a clickable bounding box',
    'a zero budget makes one attempt and names its failure');
  assert.match((await rejection(run('playwright_locator_click', {selector: '#none', timeout_ms: 300}))).message, /^(Playwright selector deadline exceeded|Timed out after 300ms waiting for selector #none: .*No element matched selector)$/);
});

test('a strict-mode violation and an open dialog end a click at once', async () => {
  const {browser, run} = setup([el('button', {cls: 'dup'}), el('button', {cls: 'dup'})]);
  const started = Date.now();
  const strict = await rejection(run('playwright_locator_click', {selector: '.dup', timeout_ms: 3000}));
  assert.equal(strict.code, 'strict_mode_violation');
  setTimeout(() => browser.event({tabId: TAB}, 'Page.javascriptDialogOpening', {type: 'alert', message: 'hi', url: 'https://fixture.test/'}), 100);
  const dialog = await rejection(run('playwright_locator_click', {selector: '#never', timeout_ms: 3000}));
  assert.equal(dialog.code, 'dialog_open');
  assert.ok(Date.now() - started < 1500, 'neither was waited out');
});

test('an element in an out-of-process frame gets its events in the frame\'s target; the cursor goes to its top-level point', async () => {
  const {run, input, moves} = setup([iframe({id: 'o', frame: {id: 'OOPIF', url: 'https://oop.test/', access: 'oopif', elements: [el('button', {id: 'deep'})]}})]);
  await run('playwright_locator_click', {selector: `#o${ENTER_FRAME}#deep`});
  const events = input('Input.dispatchMouseEvent');
  assert.deepEqual(events.map(e => e.target), [{tabId: TAB, targetId: 'OOPIF'}, {tabId: TAB, targetId: 'OOPIF'}, {tabId: TAB, targetId: 'OOPIF'}]);
  assert.deepEqual(events.map(e => [e.params.x, e.params.y]), [[160, 95], [160, 95], [160, 95]]);
  assert.deepEqual(moves, [{tabId: TAB, x: 170, y: 115}], 'the frame owner\'s quad maps the point by the frame\'s size');
});

test('an element covering the out-of-process frame at the point is named, after every scroll alignment was tried', async () => {
  const cover = el('div', {id: 'cover', cls: ['a', 'b'], attrs: {class: 'a b'}});
  const {browser, run, input, node} = setup([iframe({id: 'o', frame: {id: 'OOPIF', url: 'https://oop.test/', access: 'oopif', elements: [el('button', {id: 'deep'})]}}), cover]);
  browser.hitTest = () => cover;
  const error = await rejection(run('playwright_locator_click', {selector: `#o${ENTER_FRAME}#deep`}));
  assert.equal(error.message, 'Element does not receive pointer events at the click point; <div#cover.a.b> intercepts the click');
  assert.equal(input('Input.dispatchMouseEvent').length, 0);
  assert.equal(input('DOM.getNodeForLocation').length, 3);
  const deep = [...browser.frame('OOPIF').document.descendants()].find(e => e.id === 'deep');
  assert.deepEqual(deep.scrolls.map(s => s.block), ['center', 'end', 'start']);
  browser.hitTest = () => node('o');
  await run('playwright_locator_click', {selector: `#o${ENTER_FRAME}#deep`});
  assert.equal(input('Input.dispatchMouseEvent').length, 3, 'the frame\'s own owner at the point is no obstruction');
});

test('an open dialog or a spent budget during the obstruction check ends the click before any Input event', async () => {
  const frame = () => [iframe({id: 'o', frame: {id: 'OOPIF', url: 'https://oop.test/', access: 'oopif', elements: [el('button', {id: 'deep'})]}})];
  const dialog = setup(frame());
  dialog.browser.after('DOM.getContentQuads', () => dialog.browser.event({tabId: TAB}, 'Page.javascriptDialogOpening', {type: 'alert', message: 'hi', url: 'https://oop.test/'}));
  const opened = await rejection(dialog.run('playwright_locator_click', {selector: `#o${ENTER_FRAME}#deep`}));
  assert.equal(opened.code, 'dialog_open');
  assert.equal(dialog.input('Input.dispatchMouseEvent').length, 0);

  const spent = setup(frame());
  spent.browser.fail('DOM.getNodeForLocation', 'Timed out running CDP command "DOM.getNodeForLocation" after 3000ms');
  const timedOut = await rejection(spent.run('playwright_locator_click', {selector: `#o${ENTER_FRAME}#deep`}));
  assert.equal(timedOut.code, 'timeout');
  assert.equal(spent.input('Input.dispatchMouseEvent').length, 0);

  const missed = setup(frame());
  missed.browser.fail('DOM.getNodeForLocation', 'No node found at given location');
  await missed.run('playwright_locator_click', {selector: `#o${ENTER_FRAME}#deep`});
  assert.equal(missed.input('Input.dispatchMouseEvent').length, 3, 'a lookup that found nothing is no obstruction (the vendor\'s fallback)');

  const detached = setup(frame());
  detached.browser.fail('DOM.getNodeForLocation', 'Debugger is not attached to the tab', 2);
  assert.equal((await rejection(detached.run('playwright_locator_click', {selector: `#o${ENTER_FRAME}#deep`}))).code, 'tab_detached');
  assert.equal(detached.input('Input.dispatchMouseEvent').length, 0);

  const broken = setup(frame());
  broken.browser.fail('DOM.getNodeForLocation', 'Internal error');
  assert.equal((await rejection(broken.run('playwright_locator_click', {selector: `#o${ENTER_FRAME}#deep`}))).message, 'Internal error');
  assert.equal(broken.input('Input.dispatchMouseEvent').length, 0);
});

test('a fill\'s paste has the caller\'s budget: queued past it, it pastes nothing', async () => {
  const {run, pastes, session} = setup([el('input', {id: 'text', type: 'text', value: 'old'})]);
  let release;
  const busy = session.clipboard.runExclusive(() => new Promise(resolve => { release = resolve; }));
  const error = await rejection(run('playwright_locator_fill', {selector: '#text', value: 'alpha', timeout_ms: 300}));
  assert.equal(error.code, 'timeout');
  release();
  await busy;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(pastes.length, 0);
});

test('a clipboard shortcut queued behind another resolves its element within its own deadline: nothing runs after it', async () => {
  const field = el('input', {id: 'text', type: 'text', value: 'abc', disabled: true});
  const {browser, run, pastes, session} = setup([field]);
  session.clipboard.write([{entries: [{mime_type: 'text/plain', text: 'clip'}]}], 'test');
  let release;
  const busy = session.clipboard.runExclusive(() => new Promise(resolve => { release = resolve; }));
  setTimeout(() => release(), 200);
  const started = Date.now();
  const error = await rejection(run('playwright_locator_press', {selector: '#text', value: 'Control+v', timeout_ms: 300}));
  assert.equal(error.code, 'timeout');
  assert.ok(Date.now() - started < 500, `rejected with its budget (${Date.now() - started} ms)`);
  await busy;
  const calls = browser.calls.length;
  field.disabled = false;
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(browser.calls.length, calls, 'no CDP call after the deadline');
  assert.notEqual(field.ownerDocument.activeElement, field, 'the field was never focused');
  assert.equal(pastes.length, 0);
});

test('a zero budget makes one attempt for the element, then dispatches within the default 3 s: click, fill and press', async () => {
  const {run, mouse, keys, pastes} = setup([el('button', {id: 'go'}), el('input', {id: 'text', type: 'text', value: ''})]);
  await run('playwright_locator_click', {selector: '#go', timeout_ms: 0});
  assert.equal(mouse().length, 3);
  await run('playwright_locator_fill', {selector: '#text', value: 'zero', timeout_ms: 0});
  assert.equal(pastes.length, 1);
  await run('playwright_locator_press', {selector: '#text', value: 'End', timeout_ms: 0});
  assert.deepEqual(keys(), ['rawKeyDown End', 'keyUp End']);
});

test('two fills started together each prepare and paste in one operation, the paste checked against its own field', async () => {
  const a = el('input', {id: 'a', type: 'text', value: ''});
  const b = el('input', {id: 'b', type: 'text', value: ''});
  const {browser, run, pastes} = setup([a, b]);
  await Promise.all([run('playwright_locator_fill', {selector: '#a', value: 'A'}), run('playwright_locator_fill', {selector: '#b', value: 'B'})]);
  assert.deepEqual(pastes.map(p => p.args.clipboardItems[0].entries[0].text).sort(), ['A', 'B']);
  for (const paste of pastes) {
    const field = paste.args.clipboardItems[0].entries[0].text === 'A' ? a : b;
    assert.equal(paste.args.inputTargetToken, field.__cuaInputTargetToken, 'each paste names the token its own field carries');
  }
  // The order of the page work: each field's selection is followed by its own paste.
  const steps = browser.calls.filter(c => c.method === 'Runtime.evaluate' && !c.params.expression.includes('PlaywrightInjected.InjectedScript')
    && (c.params.expression.includes('const pageFunction') || c.params.expression.includes('needsinput'))).map(c => (c.params.expression.includes('const pageFunction') ? 'paste' : 'prepare'));
  assert.deepEqual(steps, ['prepare', 'paste', 'prepare', 'paste']);
});

test('a zero-budget shortcut queued behind another focuses within the shortcut\'s own 3 s attempt, not a fresh one', async () => {
  const field = el('input', {id: 'text', type: 'text', value: 'abc'});
  // The reviewer's timings: the queue is held 2,850 ms and the page takes 350 ms to answer the focusing.
  const {browser, run, pastes, session} = setup([field], {slow: request => (request.method === 'Runtime.evaluate'
    && request.commandParams.expression.includes('to.be.focused') ? 350 : 0)});
  session.clipboard.write([{entries: [{mime_type: 'text/plain', text: 'clip'}]}], 'test');
  let release;
  const busy = session.clipboard.runExclusive(() => new Promise(resolve => { release = resolve; }));
  setTimeout(() => release(), 2850);
  const started = Date.now();
  const error = await rejection(run('playwright_locator_press', {selector: '#text', value: 'Control+v', timeout_ms: 0}));
  await busy;
  const settledAt = Date.now() - started;
  assert.equal(error.code, 'timeout');
  assert.ok(settledAt < 3150, `ended with the shortcut's attempt budget (${settledAt} ms)`);
  const late = browser.dispatchedAt.filter(d => d.at - started > 3050 && d.method !== 'Runtime.releaseObject');
  assert.deepEqual(late, [], 'nothing dispatched after the attempt budget');
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(pastes.length, 0);
});

test('fill selects the field\'s text and pastes the value over it in the locator\'s world; a value set directly needs no paste', async () => {
  const {browser, run, pastes, node} = setup([el('input', {id: 'text', type: 'text', value: 'old'}), el('input', {id: 'date', type: 'date', value: ''})]);
  assert.deepEqual(await run('playwright_locator_fill', {selector: '#text', value: 'alpha', replace: true}), {});
  assert.equal(pastes.length, 1);
  assert.deepEqual(pastes[0].target, {tabId: TAB});
  assert.equal(pastes[0].contextId, browser.world(`MAIN-${TAB}`, 'cua-browser-injected').id);
  assert.deepEqual(pastes[0].args.clipboardItems, [{entries: [{mime_type: 'text/plain', text: 'alpha'}], presentation_style: 'unspecified'}]);
  assert.equal(pastes[0].args.replaceInputValue, true);
  assert.equal(node('text').selectionEnd, 3, 'the old value was selected first');
  await run('playwright_locator_fill', {selector: '#date', value: '2026-10-13', replace: true});
  assert.equal(node('date').value, '2026-10-13');
  assert.equal(pastes.length, 1);
});

test('locator.type focuses the editable field and pastes without replacing; fill refuses a field it cannot edit', async () => {
  const {run, pastes, node} = setup([el('input', {id: 'text', type: 'text', value: 'abc'}), el('input', {id: 'ro', type: 'text', readOnly: true})]);
  await run('playwright_locator_fill', {selector: '#text', value: 'd', replace: false});
  assert.equal(pastes[0].args.replaceInputValue, false);
  assert.equal(node('text').ownerDocument.activeElement, node('text'));
  assert.match((await rejection(run('playwright_locator_fill', {selector: '#ro', value: 'x', timeout_ms: 0}))).message, /Element is not editable$/);
  assert.equal((await rejection(run('playwright_locator_fill', {selector: '#text', value: 3}))).message, 'playwright_locator_fill requires string value');
});

test('press focuses the element and presses the keys in its target; a clipboard shortcut pastes from the virtual clipboard', async () => {
  const {run, keys, pastes, session, node} = setup([el('input', {id: 'text', type: 'text', value: 'abc'})]);
  await run('playwright_locator_press', {selector: '#text', value: 'Home'});
  assert.equal(node('text').ownerDocument.activeElement, node('text'));
  assert.deepEqual(keys(), ['rawKeyDown Home', 'keyUp Home']);
  session.clipboard.write([{entries: [{mime_type: 'text/plain', text: 'clip'}]}], 'test');
  await run('playwright_locator_press', {selector: '#text', value: 'Control+v'});
  assert.equal(keys().length, 2, 'no native paste');
  assert.deepEqual(pastes[0].args.clipboardItems, [{entries: [{mime_type: 'text/plain', text: 'clip'}]}]);
  assert.equal((await rejection(run('playwright_locator_press', {selector: '#text', value: ''}))).message, 'playwright_locator_press requires value');
});

test('pressSequentially types each character as a key into the focused field, checking focus before each', async () => {
  const {run, keys, input, node} = setup([el('input', {id: 'text', type: 'text', value: ''})]);
  await run('playwright_locator_press_sequentially', {selector: '#text', value: 'hé'});
  assert.deepEqual(keys(), ['keyDown h', 'keyUp h']);
  assert.deepEqual(input('Input.insertText').map(c => c.params.text), ['é']);
  assert.equal(Object.getOwnPropertyDescriptor(node('text'), '__codexPressSequentiallyTargetToken'), undefined, 'the target token is cleaned up');
  assert.equal((await rejection(run('playwright_locator_press_sequentially', {selector: '#text', value: null}))).message,
    'playwright_locator_press_sequentially requires string value');
});

test('pressSequentially stops when the field loses focus, and its budget is capped at 5 s', async () => {
  const other = el('input', {id: 'other', type: 'text'});
  const {run, keys} = setup([el('input', {id: 'text', type: 'text', value: ''}), other], {onInput: (target, params) => {
    if (params.type === 'keyUp' && params.key === 'a') other.focus();
  }});
  assert.equal((await rejection(run('playwright_locator_press_sequentially', {selector: '#text', value: 'abc'}))).message,
    'pressSequentially target changed or lost focus while typing');
  assert.deepEqual(keys(), ['keyDown a', 'keyUp a']);
  const slow = setup([el('input', {id: 'text', type: 'text', value: ''})]);
  const started = Date.now();
  const error = await rejection(slow.run('playwright_locator_press_sequentially', {selector: '#text', value: 'x'.repeat(200), timeout_ms: 60000}));
  assert.equal(error.code, 'timeout');
  assert.ok(Date.now() - started < 6500, `stopped at the 5 s cap (${Date.now() - started} ms)`);
  const zero = setup([el('input', {id: 'text', type: 'text'})]);
  assert.equal((await rejection(zero.run('playwright_locator_press_sequentially', {selector: '#text', value: 'x', timeout_ms: 0}))).message,
    'Playwright selector deadline exceeded', 'a zero budget leaves pressSequentially no time, as the vendor\'s');
});

test('selectOption selects through the injected script; a missing option or a non-select fails with its error', async () => {
  const select = el('select', {id: 'pick', children: [el('option', {text: 'A', attrs: {value: 'a'}}), el('option', {text: 'B', attrs: {value: 'b'}})]});
  const {run} = setup([select, el('div', {id: 'plain'})]);
  assert.deepEqual(await run('playwright_locator_select_option', {selector: '#pick', selections: [{value: 'b'}]}), {});
  assert.equal(select.value, 'b');
  await run('playwright_locator_select_option', {selector: '#pick', selections: [{label: 'A'}]});
  assert.equal(select.value, 'a');
  assert.match((await rejection(run('playwright_locator_select_option', {selector: '#pick', selections: [{value: 'z'}], timeout_ms: 0}))).message, /Error: error:optionsnotfound$/);
  assert.match((await rejection(run('playwright_locator_select_option', {selector: '#plain', selections: [{value: 'a'}], timeout_ms: 0}))).message, /Element is not a <select> element$/);
});

test('setChecked clicks only when the state differs, refuses to uncheck a radio, and checks the click worked', async () => {
  const box = el('input', {id: 'box', type: 'checkbox', checked: false});
  const radio = el('input', {id: 'radio', type: 'radio', checked: true});
  const stuck = el('input', {id: 'stuck', type: 'checkbox', checked: false});
  const {run, mouse} = setup([box, radio, stuck], {onInput: (target, params) => { if (params.type === 'mouseReleased' && params.y === 95 && !box.checked) box.checked = true; }});
  stuck.rect = {left: 0, top: 300, width: 20, height: 20};
  await run('playwright_locator_set_checked', {selector: '#box', checked: true});
  assert.equal(box.checked, true);
  assert.equal(mouse().length, 3);
  await run('playwright_locator_set_checked', {selector: '#box', checked: true});
  assert.equal(mouse().length, 3, 'already checked: no click');
  assert.equal((await rejection(run('playwright_locator_set_checked', {selector: '#radio', checked: false}))).message, 'Cannot uncheck a radio button');
  assert.equal((await rejection(run('playwright_locator_set_checked', {selector: '#stuck', checked: true}))).message, 'Click did not change checked state to true');
  assert.equal((await rejection(run('playwright_locator_set_checked', {selector: '#box'}))).message, 'playwright_locator_set_checked requires checked');
});

test('waitFor waits for each state and refuses an unknown one', async () => {
  const {run, browser} = setup([el('p', {id: 'shown'}), el('p', {id: 'hidden', visible: false})]);
  assert.deepEqual(await run('playwright_locator_wait_for', {selector: '#shown', state: 'visible'}), {});
  await run('playwright_locator_wait_for', {selector: '#hidden', state: 'hidden'});
  await run('playwright_locator_wait_for', {selector: '#gone', state: 'detached'});
  await run('playwright_locator_wait_for', {selector: '#hidden', state: 'attached'});
  setTimeout(() => browser.navigate(`MAIN-${TAB}`, {elements: [el('p', {id: 'late'})]}), 300);
  await run('playwright_locator_wait_for', {selector: '#late'});
  assert.match((await rejection(run('playwright_locator_wait_for', {selector: '#late', state: 'hidden', timeout_ms: 0}))).message,
    /^Timed out after 0ms waiting for selector #late: .*Element is not hidden$/);
  assert.equal((await rejection(run('playwright_locator_wait_for', {selector: '#shown', state: 'enabled'}))).message, 'Unsupported waitFor state: enabled');
});

test('downloadMedia finds the element\'s media URL and frame, arms the download and clicks a download link for it', async () => {
  const image = Object.assign(el('img', {id: 'image'}), {currentSrc: 'https://fixture.test/media/image.svg'});
  const {run, session} = setup([image]);
  const calls = [];
  session.downloads = {
    withDownload: async (tabId, work) => { calls.push(['with', tabId]); return await work(); },
    enableMediaDownload: async (tabId, url, frameId) => { calls.push(['enable', tabId, url, frameId]); return async () => { calls.push(['release']); }; },
    waitForDownload: async (tabId, timeoutMs) => { calls.push(['wait', tabId, timeoutMs > 100000]); return {filename: '/downloads/image.svg'}; },
  };
  const clicked = [];
  image.ownerDocument.createElement = tag => { const anchor = {tag, style: {}, click() { clicked.push({href: anchor.href, download: anchor.download}); }, remove() {}}; return anchor; };
  image.ownerDocument.body.appendChild = () => {};
  assert.deepEqual(await run('playwright_locator_download_media', {selector: '#image'}), {path: '/downloads/image.svg'});
  assert.deepEqual(calls, [['with', TAB], ['enable', TAB, 'https://fixture.test/media/image.svg', `MAIN-${TAB}`], ['wait', TAB, true], ['release']]);
  assert.deepEqual(clicked, [{href: 'https://fixture.test/media/image.svg', download: 'image.svg'}]);
});

test('downloadMedia over the session\'s downloads: the link\'s request in the media\'s frame is let through and its path answered', async () => {
  const image = Object.assign(el('img', {id: 'image'}), {currentSrc: 'https://fixture.test/media/image.svg'});
  const {api, run, session, browser} = setup([image]);
  session.documentResponses = new DocumentResponses(session.cdp);
  session.downloads = new Downloads(api, session.documentResponses);
  const source = {tabId: TAB};
  const svg = [{name: 'content-type', value: 'image/svg+xml'}];
  // The page following the download link: Chrome pauses its document request in the media's frame, then the response;
  // a page image elsewhere is requested meanwhile; the host reports the download Chrome made.
  image.ownerDocument.createElement = tag => ({tag, style: {}, remove() {}, click() {
    setImmediate(() => {
      browser.event(source, 'Fetch.requestPaused', {requestId: 'other', frameId: 'ELSEWHERE', resourceType: 'Document', request: {url: this.href}});
      browser.event(source, 'Fetch.requestPaused', {requestId: 'link', frameId: `MAIN-${TAB}`, resourceType: 'Document', request: {url: this.href}});
      setImmediate(() => {
        browser.event(source, 'Fetch.requestPaused', {requestId: 'other', frameId: 'ELSEWHERE', resourceType: 'Document', request: {url: this.href}, responseStatusCode: 200, responseHeaders: svg});
        browser.event(source, 'Fetch.requestPaused', {requestId: 'link', frameId: `MAIN-${TAB}`, resourceType: 'Document', request: {url: this.href}, responseStatusCode: 200, responseHeaders: svg});
        setTimeout(() => {
          browser.downloadChange({id: '31', url: this.href, filename: '', status: 'started'});
          browser.downloadChange({id: '31', url: this.href, filename: '/Users/agent/Downloads/image.svg', status: 'complete'});
        }, 20);
      });
    });
  }});
  image.ownerDocument.body.appendChild = () => {};
  assert.deepEqual(await run('playwright_locator_download_media', {selector: '#image'}), {path: '/Users/agent/Downloads/image.svg'});
  const fetches = browser.calls.filter(c => c.method?.startsWith('Fetch.')).map(c => [c.method, c.params.requestId ?? c.params.patterns.length]);
  assert.deepEqual(fetches.filter(([m]) => m === 'Fetch.continueResponse'), [['Fetch.continueResponse', 'other'], ['Fetch.continueResponse', 'link']]);
  const link = browser.calls.find(c => c.method === 'Fetch.continueResponse' && c.params.requestId === 'link');
  assert.deepEqual(link.params.responseHeaders, [...svg, {name: 'Content-Disposition', value: 'attachment'}], 'the image is saved, not shown');
  assert.equal(browser.calls.filter(c => c.method === 'Fetch.continueResponse' && c.params.requestId === 'other')[0].params.responseHeaders, undefined);
  assert.deepEqual(browser.calls.filter(c => c.method === 'Fetch.enable').at(-1).params.patterns, [{requestStage: 'Response', resourceType: 'Document'}],
    'request interception off again');
});
