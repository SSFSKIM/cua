// The tab_clipboard_* commands and the page clipboard bridge (src/browser-service/clipboard.mjs and
// clipboard-bridge.mjs, the vendor's l1, c1, d1, p1 and Xf, readable chatgpt-26.928.40906 BS:50362-50430 and
// BS:63597-63884), through the real host and the fake extension: each command installs the bridge in the tab once
// (a binding, the page script for this and later documents, a check that it took), the page's navigator.clipboard
// calls arrive as binding calls and are answered from the same virtual clipboard the commands read and write, and the
// turn's end removes the bridge from the page. The page script itself runs in Chrome (the live corpus' page case).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {Clipboard} from '../../src/browser-service/clipboard.mjs';
import {Deadline} from '../../src/browser-service/budgets.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost, waitFor} from './support/service-on-host.mjs';

// Scripted pages where the bridge's installation check answers true and its script gets an identifier.
function bridgePages() {
  const pages = scriptedPages();
  const chrome = {installs: true};
  const cdp = request => {
    if (request.method === 'Page.addScriptToEvaluateOnNewDocument') {
      pages.sent.push({tabId: request.debuggee.tabId, method: request.method, params: request.params});
      return {identifier: `script-${pages.sent.length}`};
    }
    if (request.method === 'Runtime.evaluate' && /^globalThis\.__browserUseClipboardBridge\?\.bindingName === /.test(request.params.expression)) {
      pages.sent.push({tabId: request.debuggee.tabId, method: request.method, params: request.params});
      return {result: {type: 'boolean', value: chrome.installs}};
    }
    return pages.cdp(request);
  };
  return {...pages, cdp, chrome};
}

async function tabOn(t) {
  const pages = bridgePages();
  const env = await serviceOnHost(t, {pages});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
  const sent = method => pages.sent.filter(s => s.method === method && s.tabId === Number(id)).map(s => s.params);
  const bindingName = () => sent('Runtime.addBinding').at(-1)?.name;
  // The page calling its navigator.clipboard: the bridge's binding called with a request.
  const pageCalls = request => env.ext.cdpEvent({tabId: Number(id)}, 'Runtime.bindingCalled', {name: bindingName(), executionContextId: 3, payload: JSON.stringify(request)});
  const answers = () => sent('Runtime.evaluate').filter(p => p.expression.startsWith('globalThis.__browserUseClipboardBridge?.respond('))
    .map(p => ({contextId: p.contextId, answer: JSON.parse(JSON.parse(p.expression.slice('globalThis.__browserUseClipboardBridge?.respond('.length, -1)))}));
  return {...env, pages, browserId, run, sent, bindingName, pageCalls, answers, tabId: id};
}

const text = value => ({entries: [{mime_type: 'text/plain', text: value}], presentation_style: 'unspecified'});

test('the four clipboard commands are registered', () => {
  for (const type of ['tab_clipboard_read', 'tab_clipboard_read_text', 'tab_clipboard_write', 'tab_clipboard_write_text']) {
    assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
  }
});

test('writeText then readText, write then read; the bridge is installed in the tab once', async t => {
  const {run, sent, bindingName} = await tabOn(t);
  assert.deepEqual(await run({type: 'tab_clipboard_read_text'}), {text: ''}, 'empty at first');
  assert.deepEqual(await run({type: 'tab_clipboard_write_text', text: 'parity text'}), {});
  assert.deepEqual(await run({type: 'tab_clipboard_read_text'}), {text: 'parity text'});
  const items = [{entries: [{mime_type: 'text/html', text: '<b>rich</b>'}, {mime_type: 'text/plain', text: 'rich'}]}, {entries: [{mime_type: 'image/png', base64: 'AAAA'}], presentation_style: 'inline'}];
  assert.deepEqual(await run({type: 'tab_clipboard_write', items}), {});
  assert.deepEqual(await run({type: 'tab_clipboard_read'}), {items});
  assert.deepEqual(await run({type: 'tab_clipboard_read_text'}), {text: 'rich'});
  assert.equal(sent('Runtime.addBinding').length, 1, 'one installation for every command');
  assert.match(bindingName(), /^__browserUseClipboard_[0-9a-f]{32}$/);
  const [script] = sent('Page.addScriptToEvaluateOnNewDocument');
  assert.equal(script.runImmediately, true);
  assert.ok(script.source.includes(`installPageClipboardBridge(${JSON.stringify(bindingName())})`));
});

test('malformed writes are refused with the vendor\'s sentences and leave the clipboard as it was', async t => {
  const {run} = await tabOn(t);
  await run({type: 'tab_clipboard_write_text', text: 'kept'});
  assert.equal((await rejection(run({type: 'tab_clipboard_write', items: []}))).message, 'tab_clipboard_write requires items');
  assert.equal((await rejection(run({type: 'tab_clipboard_write', items: [{entries: [{mime_type: 'text/plain'}]}]}))).message,
    'tab_clipboard_write requires exactly one of entry text or base64');
  assert.equal((await rejection(run({type: 'tab_clipboard_write_text', text: 5}))).message, 'tab_clipboard_write_text requires text');
  assert.deepEqual(await run({type: 'tab_clipboard_read_text'}), {text: 'kept'});
});

test('the page\'s clipboard calls are answered in the calling context from the same clipboard the commands use', async t => {
  const {run, pageCalls, answers} = await tabOn(t);
  await run({type: 'tab_clipboard_write_text', text: 'from the agent'});
  pageCalls({id: 1, operation: 'read'});
  await waitFor(() => answers().length === 1, 'the read answered');
  assert.deepEqual(answers()[0], {contextId: 3, answer: {id: 1, items: [text('from the agent')], ok: true}});
  pageCalls({id: 2, operation: 'write', items: [text('from the page')]});
  await waitFor(() => answers().length === 2, 'the write answered');
  assert.deepEqual(answers()[1].answer, {id: 2, ok: true});
  assert.deepEqual(await run({type: 'tab_clipboard_read_text'}), {text: 'from the page'});
  pageCalls({id: 3, operation: 'write', items: [{entries: []}]});
  pageCalls({id: 4, operation: 'erase'});
  pageCalls({id: 5});
  pageCalls({operation: 'read'});
  await waitFor(() => answers().length === 5, 'the refusals answered');
  assert.deepEqual(answers().slice(2).map(a => a.answer), [
    {error: 'navigator.clipboard.write requires clipboard item entries', id: 3, ok: false},
    {error: 'Unsupported clipboard operation', id: 4, ok: false},
    {error: 'Clipboard request is missing an operation', id: 5, ok: false},
  ], 'a request without an id is not answered');
  assert.deepEqual(await run({type: 'tab_clipboard_read_text'}), {text: 'from the page'});
});

test('the turn\'s end removes the bridge from the page; the next command installs it again', async t => {
  const env = await tabOn(t);
  const {run, sent, turnEnded} = env;
  await run({type: 'tab_clipboard_write_text', text: 'x'});
  await run({type: 'mark_tab', status: 'deliverable'});
  await turnEnded();
  await waitFor(() => sent('Runtime.removeBinding').length === 1, 'the binding removed');
  const first = sent('Runtime.addBinding')[0].name;
  assert.deepEqual(sent('Runtime.removeBinding'), [{name: first}]);
  assert.equal(sent('Page.removeScriptToEvaluateOnNewDocument').length, 1);
  assert.ok(sent('Runtime.evaluate').some(p => p.expression === `globalThis.__browserUseClipboardBridge?.bindingName === ${JSON.stringify(first)} && globalThis.__browserUseClipboardBridge.cleanup()`));
  env.setTurn({session_id: 'session-a', turn_id: 'turn-2'});
  assert.deepEqual(await run({type: 'tab_clipboard_read_text'}), {text: 'x'}, 'the clipboard itself outlives the turn, as the vendor\'s does');
  assert.equal(sent('Runtime.addBinding').length, 2);
  assert.notEqual(sent('Runtime.addBinding')[1].name, first);
});

test('an installation the page does not confirm fails, is undone, and is tried afresh by the next command', async t => {
  const {run, sent, pages} = await tabOn(t);
  pages.chrome.installs = false;
  assert.equal((await rejection(run({type: 'tab_clipboard_read_text'}))).message, 'Browser Use clipboard bridge installation failed');
  assert.equal(sent('Runtime.removeBinding').length, 1);
  assert.equal(sent('Page.removeScriptToEvaluateOnNewDocument').length, 1);
  pages.chrome.installs = true;
  assert.deepEqual(await run({type: 'tab_clipboard_read_text'}), {text: ''});
  assert.equal(sent('Runtime.addBinding').length, 2);
});

// The bridge over a controller double whose calls take `slow` ms each, recording each call's deadline.
function slowBridge(slow) {
  const calls = [];
  const cdp = {
    listeners: {},
    on(name, listener) { (this.listeners[name] ??= []).push(listener); },
    removeListener() {},
    addTabCleanupHandler() { return () => {}; },
    async callTarget(target, method, params, options = {}) {
      options.deadline?.timeoutMs();
      calls.push({method, deadline: options.deadline});
      await new Promise(resolve => setTimeout(resolve, slow));
      options.deadline?.check();
      if (method === 'Page.addScriptToEvaluateOnNewDocument') return {identifier: 'S'};
      if (method === 'Runtime.evaluate') return {result: {value: true}};
      return {};
    },
  };
  return {cdp, calls, clipboard: new Clipboard()};
}

test('an installation carries its starter\'s deadline; a joiner waits only within its own and installs again if the starter\'s ran out', async () => {
  const {cdp, calls, clipboard} = slowBridge(20);
  const starter = clipboard.ensurePageClipboard(cdp, {tabId: 4}, {deadline: new Deadline(30)});
  const joiner = clipboard.ensurePageClipboard(cdp, {tabId: 4}, {deadline: new Deadline(2000)});
  await assert.rejects(starter, error => error.code === 'timeout');
  await joiner;
  assert.ok(calls.every(c => c.deadline != null), 'every installation call is budgeted');
  assert.equal(calls.filter(c => c.method === 'Runtime.addBinding').length, 2, 'the joiner installed on its own budget');
  const quick = clipboard.ensurePageClipboard(cdp, {tabId: 9}, {deadline: new Deadline(0)});
  await assert.rejects(quick, error => error.code === 'timeout');
  assert.equal(calls.filter(c => c.method === 'Runtime.addBinding').length, 2, 'nothing is dispatched on a spent deadline');
  await clipboard.dispose();
});
