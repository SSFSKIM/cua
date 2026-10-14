// tab_get_js_dialog and tab_handle_js_dialog (src/browser-service/dialogs.mjs, the vendor's q1, pf and m1, readable
// chatgpt-26.928.40906 BS:50431-50490 and BS:54471-54485) over the CDP controller's dialog tracking, through the real
// host and the fake extension: a dialog Chrome opens is reported, blocks the tab's other commands with dialog_open at
// once, and is answered with Page.handleJavaScriptDialog, the command settling when Chrome says the dialog closed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost, waitFor} from './support/service-on-host.mjs';

// Scripted pages where Page.handleJavaScriptDialog closes the dialog (Chrome's javascriptDialogClosed), unless the test
// holds the close back with `pages.chrome.holdClose = true`.
function dialogPages() {
  const pages = scriptedPages();
  const chrome = {holdClose: false};
  let ext = null;
  const cdp = request => {
    if (request.method === 'Page.handleJavaScriptDialog' && !chrome.holdClose) {
      setImmediate(() => ext.cdpEvent(request.debuggee, 'Page.javascriptDialogClosed', {result: request.params.accept, userInput: request.params.promptText ?? ''}));
    }
    return pages.cdp(request);
  };
  return {...pages, cdp, chrome, bind(extension) { ext = extension; pages.bind(extension); }};
}

async function tabWithDialogs(t) {
  const pages = dialogPages();
  const env = await serviceOnHost(t, {pages});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
  // The tab attached (a command reached it), then Chrome opens a dialog in it.
  await run({type: 'navigate_tab_url', url: 'https://example.com/dialogs'});
  const open = async (type, extra = {}) => {
    env.ext.cdpEvent({tabId: Number(id)}, 'Page.javascriptDialogOpening', {type, message: `a ${type}`, url: 'https://example.com/dialogs', hasBrowserHandler: true, ...extra});
    await waitFor(async () => (await run({type: 'tab_get_js_dialog'})).dialog?.type === type, `the ${type} to be tracked`);
    return (await run({type: 'tab_get_js_dialog'})).dialog;
  };
  const answers = () => pages.sent.filter(s => s.method === 'Page.handleJavaScriptDialog').map(s => s.params);
  return {...env, pages, run, open, answers, tabId: id};
}

test('both dialog commands are registered', () => {
  for (const type of ['tab_get_js_dialog', 'tab_handle_js_dialog']) assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
});

test('getJsDialog reports no dialog, then the open one by id and type, then none once it is answered', async t => {
  const {run, open, answers} = await tabWithDialogs(t);
  assert.deepEqual(await run({type: 'tab_get_js_dialog'}), {dialog: null});
  const dialog = await open('alert');
  assert.deepEqual(Object.keys(dialog).sort(), ['id', 'type']);
  assert.equal(typeof dialog.id, 'string');
  assert.deepEqual(await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'dismiss'}), {});
  assert.deepEqual(answers(), [{accept: true}], 'an alert is dismissed by accepting it, as the vendor does');
  assert.deepEqual(await run({type: 'tab_get_js_dialog'}), {dialog: null});
});

test('a locator action while a dialog is open fails at once with dialog_open, and works again once it is dismissed', async t => {
  const {run, open} = await tabWithDialogs(t);
  const dialog = await open('alert');
  const started = Date.now();
  const error = await rejection(run({type: 'playwright_locator_click', selector: '#confirm', timeout_ms: 2000}));
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'dialog_open');
  assert.equal(error.message, 'A alert JavaScript dialog is active in this tab. Use `tab.getJsDialog()` to get it and dismiss it first.');
  assert.ok(Date.now() - started < 1000, `final at once, not after the selector budget (${Date.now() - started} ms)`);
  await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'dismiss'});
  assert.deepEqual(await run({type: 'navigate_tab_reload'}), {}, 'the tab takes commands again');
});

test('accept answers a confirm with accept and a prompt with its text; dismiss answers them with accept: false', async t => {
  const {run, open, answers} = await tabWithDialogs(t);
  let dialog = await open('confirm');
  await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'accept'});
  dialog = await open('prompt', {defaultPrompt: 'default'});
  await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'accept', prompt_text: 'parity'});
  dialog = await open('confirm');
  await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'dismiss'});
  dialog = await open('prompt');
  await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'dismiss'});
  assert.deepEqual(answers(), [{accept: true}, {accept: true, promptText: 'parity'}, {accept: false}, {accept: false}]);
});

test('the vendor\'s refusals: accept on an alert or beforeunload, prompt text on a confirm, a prompt without text, an unknown action, a stale id', async t => {
  const {run, open, answers, ext, tabId} = await tabWithDialogs(t);
  let dialog = await open('alert');
  assert.equal((await rejection(run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'accept'}))).message, 'Dialog type alert does not support accept()');
  assert.equal((await rejection(run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'close'}))).message, 'Unsupported dialog action: close');
  assert.equal((await rejection(run({type: 'tab_handle_js_dialog', dialog_id: 'stale', action: 'dismiss'}))).message, 'JavaScript dialog is no longer active');
  assert.equal((await rejection(run({type: 'tab_handle_js_dialog', action: 'dismiss'}))).message, 'handleJsDialog requires a dialog_id');
  await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'dismiss'});
  dialog = await open('confirm');
  assert.equal((await rejection(run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'accept', prompt_text: 'x'}))).message, 'Confirm dialogs do not accept prompt text');
  await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'dismiss'});
  dialog = await open('prompt');
  assert.equal((await rejection(run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'accept'}))).message, 'Prompt dialogs require prompt text');
  assert.equal((await rejection(run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'accept', prompt_text: 7}))).message, 'Prompt dialogs require prompt text');
  await run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'dismiss'});
  assert.equal(answers().length, 3, 'a refused answer sends nothing');
  // A beforeunload dialog is accepted by the controller itself; were one tracked, accept would be refused as the vendor's.
  ext.cdpEvent({tabId: Number(tabId)}, 'Page.javascriptDialogOpening', {type: 'beforeunload', message: '', url: 'https://example.com/dialogs', hasBrowserHandler: true});
  await waitFor(() => answers().length === 4, 'the controller to accept the beforeunload');
  assert.deepEqual(answers()[3], {accept: true});
});

test('handleJsDialog settles only once Chrome reports the dialog closed', async t => {
  const {run, open, pages, ext, tabId} = await tabWithDialogs(t);
  const dialog = await open('confirm');
  pages.chrome.holdClose = true;
  let settled = false;
  const answering = run({type: 'tab_handle_js_dialog', dialog_id: dialog.id, action: 'dismiss'});
  answering.then(() => { settled = true; }, () => { settled = true; });
  await waitFor(() => pages.sent.some(s => s.method === 'Page.handleJavaScriptDialog'), 'the answer to be sent');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(settled, false, 'the answer is sent, the dialog not yet closed');
  ext.cdpEvent({tabId: Number(tabId)}, 'Page.javascriptDialogClosed', {result: false, userInput: ''});
  assert.deepEqual(await answering, {});
  assert.deepEqual(await run({type: 'tab_get_js_dialog'}), {dialog: null});
});
