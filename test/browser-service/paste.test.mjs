// Typing by paste and the clipboard shortcuts (src/browser-service/paste.mjs, the port of Vi, el, Ku, rb, kn and _j):
// cua_type, dom_cua_type and fill put text into the focused field by dispatching a paste event in the page (the
// page's own handlers see it) and inserting what the page left to the default; the copy, cut and paste shortcuts run
// against the session's virtual clipboard instead of the system's. The node side runs over a stub controller; the
// page function runs for real in node:vm over a small DOM.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Deadline} from '../../src/browser-service/budgets.mjs';
import {Clipboard} from '../../src/browser-service/clipboard.mjs';
import {NATIVE_CLIPBOARD_DISABLED} from '../../src/browser-service/keyboard.mjs';
import {pageClipboardAction, performClipboardShortcut, richTextHtml, typeText} from '../../src/browser-service/paste.mjs';

const soon = () => new Deadline(2000);
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

// A session whose page answers each clipboard evaluation with `answer(args)`; the focused-frame probe finds no frame.
function session({url = 'https://fixture.test/form', answer = () => ({ok: true, data: {}})} = {}) {
  const calls = [];
  const evaluated = [];
  const cdp = {
    async callTarget(target, method, params, options = {}) {
      calls.push({target, method, params, options});
      if (method !== 'Runtime.evaluate') return {};
      if (params.expression.includes('focusedFrameElementInRoot')) return {result: {type: 'object', subtype: 'null', value: null}};
      const args = JSON.parse(params.expression.match(/await pageFunction\((.*)\);\n/)[1]);
      evaluated.push({target, contextId: params.contextId, args, params});
      const answered = answer(args);
      return answered?.exceptionDetails ? answered : {result: {type: 'object', value: answered}};
    },
  };
  return {calls, evaluated, session: {cdp, clipboard: new Clipboard(), platform: 'linux', tabs: {get: async id => ({id, url})}}};
}

test('cua_type pastes the text into the top document\'s main world, with its rich-text rendering', async () => {
  const {evaluated, session: s} = session();
  await typeText(s, {tab_id: '5', text: 'hello'}, 'cua_type', {deadline: soon()});
  assert.equal(evaluated.length, 1);
  const [{target, contextId, args, params}] = evaluated;
  assert.deepEqual(target, {tabId: 5});
  assert.equal(contextId, undefined);
  assert.equal(params.awaitPromise, true);
  assert.equal(params.returnByValue, true);
  assert.deepEqual(args.clipboardItems, [{entries: [{mime_type: 'text/plain', text: 'hello'}, {mime_type: 'text/html', text: 'hello'}], presentation_style: 'unspecified'}]);
  assert.equal(args.action, 'paste');
  assert.equal(args.richTextFallback, true);
});

test('a Google Sheets tab gets plain text only; a fill pastes plain text into the locator\'s world, replacing the value', async () => {
  const sheets = session({url: 'https://docs.google.com/spreadsheets/d/x/edit'});
  await typeText(sheets.session, {tab_id: '5', text: 'a1'}, 'cua_type', {deadline: soon()});
  assert.deepEqual(sheets.evaluated[0].args.clipboardItems[0].entries, [{mime_type: 'text/plain', text: 'a1'}]);
  assert.equal(sheets.evaluated[0].args.richTextFallback, undefined);

  const fill = session();
  await typeText(fill.session, {tab_id: '5', text: 'alpha', includeRichText: false, replaceInputValue: true,
    target: {tabId: 5, sessionId: 'OOPIF'}, executionContextId: 42}, 'playwright_locator_fill', {deadline: soon()});
  const [{target, contextId, args}] = fill.evaluated;
  assert.deepEqual(target, {tabId: 5, sessionId: 'OOPIF'});
  assert.equal(contextId, 42);
  assert.deepEqual(args.clipboardItems[0].entries, [{mime_type: 'text/plain', text: 'alpha'}]);
  assert.equal(args.replaceInputValue, true);
});

test('typing needs text; a page failure reads as the vendor\'s clipboard sentence', async () => {
  const {session: s, calls} = session();
  assert.equal((await rejection(typeText(s, {tab_id: '5'}, 'dom_cua_type', {deadline: soon()}))).message, 'dom_cua_type requires text');
  assert.equal(calls.length, 0);
  const failing = session({answer: () => ({ok: false, error: 'Browser Use virtual clipboard has no data to paste'})});
  assert.equal((await rejection(typeText(failing.session, {tab_id: '5', text: 'x'}, 'cua_type', {deadline: soon()}))).message,
    'Browser Use encountered an error interacting with this webpage\'s clipboard: Browser Use virtual clipboard has no data to paste');
  const invalid = session({answer: () => 'nonsense'});
  assert.equal((await rejection(typeText(invalid.session, {tab_id: '5', text: 'x'}, 'cua_type', {deadline: soon()}))).message,
    'Browser Use encountered an error interacting with this webpage\'s clipboard: cua_type returned an invalid result');
});

// Each expected value is the vendor's own bW (its embedded markdown-it 14.1.1 and _W) run on the same text, read from
// readable chatgpt-26.928.40906 BS:20582-27399 and BS:27439-27507.
test('the rich-text rendering is the vendor\'s: Markdown by markdown-it (breaks, no HTML), a single paragraph unwrapped, edge whitespace kept', () => {
  assert.equal(richTextHtml('hello world'), 'hello world');
  assert.equal(richTextHtml('a < b & "c"'), 'a &lt; b &amp; &quot;c&quot;');
  assert.equal(richTextHtml('one\ntwo'), 'one<br>\ntwo');
  assert.equal(richTextHtml('one\n\ntwo'), '<p>one</p>\n<p>two</p>');
  assert.equal(richTextHtml('  padded '), '&nbsp;&nbsp;padded&nbsp;');
  assert.equal(richTextHtml('\n'), '<br>');
  assert.equal(richTextHtml('Hello **world**\n\n- first item\n- second item\n\nSee [the docs](https://example.com/docs).'),
    '<p>Hello <strong>world</strong></p>\n<ul>\n<li>first item</li>\n<li>second item</li>\n</ul>\n<p>See <a href="https://example.com/docs">the docs</a>.</p>');
  assert.equal(richTextHtml('**bold** only'), '<strong>bold</strong> only');
  assert.equal(richTextHtml('  *lead* and trail  '), '&nbsp;&nbsp;<em>lead</em> and trail&nbsp;&nbsp;');
  assert.equal(richTextHtml('<b>raw</b>'), '&lt;b&gt;raw&lt;/b&gt;');
  assert.equal(richTextHtml('x ![i](javascript:alert(1)) [y](javascript:alert(1))'), 'x ![i](javascript:alert(1)) [y](javascript:alert(1))');
});

test('a copy shortcut writes what the page copied to the virtual clipboard; paste reads it back; a cut commits after', async () => {
  const {evaluated, session: s} = session({answer: args => (args.action === 'copy' ? {ok: true, data: {items: [{entries: [{mime_type: 'text/plain', text: 'copied'}]}]}}
    : args.action === 'cut' ? {ok: true, data: {items: [{entries: [{mime_type: 'text/plain', text: 'cut'}]}], cutToken: args.cutToken}} : {ok: true, data: {}})});
  assert.equal(await performClipboardShortcut({deadline: soon(), commandType: 'cua_keypress', session: s, keys: ['ctrl', 'c'], tabId: '5'}), true);
  assert.deepEqual(s.clipboard.read(), [{entries: [{mime_type: 'text/plain', text: 'copied'}]}]);
  assert.equal(evaluated[0].args.action, 'copy');
  assert.ok(evaluated[0].args.protectedCredentialFieldPolicy.pattern.includes('password'));

  assert.equal(await performClipboardShortcut({deadline: soon(), commandType: 'cua_keypress', session: s, keys: ['ctrl', 'v'], tabId: '5'}), true);
  assert.equal(evaluated[1].args.action, 'paste');
  assert.deepEqual(evaluated[1].args.clipboardItems, [{entries: [{mime_type: 'text/plain', text: 'copied'}]}]);

  assert.equal(await performClipboardShortcut({deadline: soon(), commandType: 'dom_cua_keypress', session: s, keys: ['ctrl', 'x'], tabId: '5'}), true);
  assert.equal(evaluated[2].args.action, 'cut');
  assert.equal(typeof evaluated[2].args.cutToken, 'string');
  assert.deepEqual(evaluated[3].args, {cutToken: evaluated[2].args.cutToken}, 'the cut is committed once the items are stored');
  assert.deepEqual(s.clipboard.read(), [{entries: [{mime_type: 'text/plain', text: 'cut'}]}]);
});

test('a paste-as-plain-text keeps only the plain entries; a blocked press is refused; other presses are not shortcuts', async () => {
  const {evaluated, session: s} = session();
  s.clipboard.write([{entries: [{mime_type: 'text/plain', text: 'p'}, {mime_type: 'text/html', text: '<b>p</b>'}]}], 'test');
  await performClipboardShortcut({deadline: soon(), commandType: 'cua_keypress', session: s, keys: ['ctrl', 'shift', 'v'], tabId: '5'});
  assert.deepEqual(evaluated[0].args.clipboardItems, [{entries: [{mime_type: 'text/plain', text: 'p'}]}]);
  assert.equal((await rejection(performClipboardShortcut({deadline: soon(), commandType: 'cua_keypress', session: s, keys: ['Control', 'Alt', 'v'], tabId: '5'}))).message, NATIVE_CLIPBOARD_DISABLED);
  assert.equal(await performClipboardShortcut({deadline: soon(), commandType: 'cua_keypress', session: s, keys: ['Enter'], tabId: '5'}), false);
  assert.equal(evaluated.length, 1);
});

test('a shortcut for a locator focuses it first and runs in the locator\'s world', async () => {
  const {evaluated, session: s} = session();
  const focused = [];
  await performClipboardShortcut({deadline: soon(), commandType: 'playwright_locator_press', session: s, keys: 'Control+v', tabId: '5',
    focusTarget: async forPaste => { focused.push(forPaste); return {target: {tabId: 5}, executionContextId: 9}; }});
  assert.deepEqual(focused, [true]);
  assert.equal(evaluated[0].contextId, 9);
});

// --- the page function, in node:vm ---------------------------------------------------------------------------------

function page() {
  const events = [];
  class Element {
    constructor(localName) { this._localName = localName; }
    dispatchEvent(event) { events.push(event.type); return !event.prevented; }
  }
  Object.defineProperty(Element.prototype, 'localName', {get() { return this._localName; }});
  Object.defineProperty(Element.prototype, 'namespaceURI', {get() { return 'http://www.w3.org/1999/xhtml'; }});
  class Input extends Element {
    constructor(value) { super('input'); this.value = value; this.selectionStart = 0; this.selectionEnd = value.length; this.disabled = false; this.readOnly = false; this.shadowRoot = null; }
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
    getAttribute(name) { return name === 'type' ? 'text' : null; }
    get tagName() { return 'INPUT'; }
  }
  class DataTransfer {
    data = new Map(); items = {add() {}};
    clearData() { this.data.clear(); } setData(type, value) { this.data.set(type, value); } getData(type) { return this.data.get(type) ?? ''; }
    get types() { return [...this.data.keys()]; } get files() { return []; }
  }
  class ClipboardEvent { constructor(type, init) { this.type = type; this.clipboardData = init.clipboardData; } }
  class InputEvent { constructor(type) { this.type = type; } }
  const window = {Element, DataTransfer, ClipboardEvent, InputEvent, File: class {}};
  const input = new Input('old value');
  input.ownerDocument = {defaultView: window};
  const document = {activeElement: input, body: null, hasFocus: () => true};
  window.document = document;
  const context = vm.createContext({window, document, atob, btoa});
  return {events, input, // Results cross back out of the context as plain JSON, as returnByValue does.
    run: async args => JSON.parse(JSON.stringify(await vm.runInContext(`(${pageClipboardAction.toString()})(${JSON.stringify(args)})`, context)))};
}

test('the page function pastes into the focused input: a paste event, then the text in place of the selection, then input', async () => {
  const {events, input, run} = page();
  const items = [{entries: [{mime_type: 'text/plain', text: 'new'}], presentation_style: 'unspecified'}];
  assert.deepEqual(await run({action: 'paste', clipboardItems: items, replaceInputValue: true}), {});
  assert.equal(input.value, 'new');
  assert.deepEqual(events, ['paste', 'input']);
  await assert.rejects(run({action: 'paste', clipboardItems: []}), {message: 'Browser Use virtual clipboard has no data to paste'});
});

test('the page function copies the focused input\'s selection, and withholds a credential field\'s', async () => {
  const {events, input, run} = page();
  input.selectionStart = 4;
  const policy = {attributes: ['type', 'name'], pattern: 'password'};
  assert.deepEqual(await run({action: 'copy', clipboardItems: [], protectedCredentialFieldPolicy: policy}),
    {items: [{entries: [{mime_type: 'text/plain', text: 'value'}], presentation_style: 'unspecified'}]});
  assert.deepEqual(events, ['copy']);
  input.getAttribute = name => (name === 'name' ? 'password' : 'text');
  assert.deepEqual(await run({action: 'copy', clipboardItems: [], protectedCredentialFieldPolicy: policy}), {});
});

test('a page cannot put the typed text or the clipboard\'s items into a rejection: only the page function\'s own sentences pass', async () => {
  const secret = 'hunter2-typed-secret';
  const echo = session({answer: args => ({ok: false, error: `boom ${args.clipboardItems[0]?.entries[0]?.text}`})});
  const echoed = await rejection(typeText(echo.session, {tab_id: '5', text: secret}, 'cua_type', {deadline: soon()}));
  assert.equal(echoed.message, 'Browser Use encountered an error interacting with this webpage\'s clipboard: cua_type failed');
  const thrown = session({answer: args => ({exceptionDetails: {text: secret, exception: {description: `Error: ${args.clipboardItems[0].entries[0].text}`, value: secret}}})});
  const raised = await rejection(typeText(thrown.session, {tab_id: '5', text: secret}, 'dom_cua_type', {deadline: soon()}));
  assert.equal(raised.message, 'Browser Use encountered an error interacting with this webpage\'s clipboard: dom_cua_type failed');
  for (const error of [echoed, raised]) assert.ok(!error.message.includes(secret) && !String(error.stack).includes(secret));
  const shortcut = session({answer: () => ({ok: false, error: secret})});
  shortcut.session.clipboard.write([{entries: [{mime_type: 'text/plain', text: secret}]}], 'test');
  const pasted = await rejection(performClipboardShortcut({deadline: soon(), commandType: 'cua_keypress', session: shortcut.session, keys: ['ctrl', 'v'], tabId: '5'}));
  assert.ok(!pasted.message.includes(secret));
});

test('every CDP call of a paste or shortcut carries its deadline; one queued past it dispatches nothing', async () => {
  const {calls, evaluated, session: s} = session();
  const deadline = soon();
  await typeText(s, {tab_id: '5', text: 'x'}, 'cua_type', {deadline});
  await performClipboardShortcut({deadline, commandType: 'cua_keypress', session: s, keys: ['ctrl', 'c'], tabId: '5'});
  assert.ok(calls.length >= 3);
  for (const call of calls.filter(c => c.method !== 'Runtime.releaseObject')) assert.equal(call.options.deadline, deadline, call.method);

  let release;
  const busy = s.clipboard.runExclusive(() => new Promise(resolve => { release = resolve; }));
  const before = evaluated.length;
  const error = await rejection(typeText(s, {tab_id: '5', text: 'late'}, 'cua_type', {deadline: new Deadline(20)}));
  assert.equal(error.code, 'timeout');
  release();
  await busy;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(evaluated.length, before, 'the queued paste never ran');
});
