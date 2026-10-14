// The real-client error proof (the spec's M1a, "The REPL contract, exactly"): the unchanged REPL client the runtime
// imports (BC, @oai/cua's oai_js_browser browser-client.js from the installed runtime) drives cua's service through the
// trusted wrapper (src/services/browser.mjs) and node_repl's RPC boundary, and a rejection reaches model code as a
// rejection carrying the service's sentence, never the client's "Browser service returned an invalid recovery response".
//
// The boundary is emulated as the pinned node_repl 26.928.40906 implements it (its embedded trusted worker and kernel,
// read from the node_repl binary): the worker answers {ok:false, error: error instanceof Error ? error.message :
// String(error)} and the kernel rejects `new Error(response.error)`; a value crosses as JSON. So only the message
// reaches the client: a BrowserServiceError's code stays in the trusted worker (where the wrapper classifies it).
//
// dialog_open and unsupported_command come from the real dispatch and the CDP controller; the dialog commands (M2) answer
// a dialog end to end through the client. The locator commands'
// timeout and strict-mode rejections are M1b/M1c's to produce; until then a test double registered in
// COMMAND_HANDLERS throws them with the vendor's sentences as the live vendor run recorded them
// (docs/evidence/2026-10-13-own-browser-service-parity/vendor-1/results.jsonl, actions/slow-budget and
// actions/strict-error), which proves the path those milestones' errors take. Skips visibly without the vendor runtime.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultHome, readPointer} from '../../src/runtime/layout.mjs';
import {COMMAND_HANDLERS, SERVICE_VERSION} from '../../src/browser-service/index.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {createBrowserService as createWrapper, PINNED_CUA_VERSION} from '../../src/services/browser.mjs';
import {serviceOnHost, waitFor} from './support/service-on-host.mjs';

function installedClient() {
  if (process.env.CUA_PARITY_BROWSER_CLIENT) return existsSync(process.env.CUA_PARITY_BROWSER_CLIENT) ? process.env.CUA_PARITY_BROWSER_CLIENT : null;
  const home = defaultHome();
  const release = readPointer(home);
  if (!release) return null;
  const path = join(home, 'runtimes', release, 'cua_node/lib/node_modules/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js');
  return existsSync(path) ? path : null;
}
const CLIENT = installedClient();

// The vendor's locator sentences as its service throws them, from its live run on the mini (vendor-1): the model saw
// each followed by the client's own "\nwaiting on click for selector <selector>" and, when the client's evaluateAll
// diagnostics succeed (M1b), "\nLocator diagnostics: {...}" (browser-client.js actionError and bl).
const SELECTOR_DEADLINE = 'Error: Playwright selector deadline exceeded';
const STRICT = 'Error: Browser Use encountered an error interacting with this webpage: Error: strict mode violation: locator(\'.duplicate\') resolved to 2 elements:\n    1) <button class="duplicate">Same</button> aka getByRole(\'button\', { name: \'Same\' }).first()\n    2) <button class="duplicate">Same</button> aka getByRole(\'button\', { name: \'Same\' }).nth(1)\n';

// node_repl's trusted RPC as the kernel sees it: the trusted service's rejection becomes its message, a value its JSON.
function trustedRpc(wrapper, calls) {
  return async (service, request) => {
    assert.equal(service, 'browser');
    calls.push(request.method);
    let value;
    try {
      value = await wrapper.handleRpc(structuredClone(request));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
    return JSON.parse(JSON.stringify(value ?? null));
  };
}

async function realClient(t) {
  const env = await serviceOnHost(t);
  const wrapper = createWrapper({loadService: async () => env.service, actualServiceVersion: async () => SERVICE_VERSION,
    expectedVersion: PINNED_CUA_VERSION, serviceName: 'cua', secrets: {read: async () => assert.fail('no secret is read')}});
  const calls = [];
  const saved = globalThis.nodeRepl;
  globalThis.nodeRepl = {rpc: trustedRpc(wrapper, calls), emitImage: async () => {}, env: {}};
  t.after(() => { globalThis.nodeRepl = saved; });
  const {setupBrowserRuntime} = await import(pathToFileURL(CLIENT).href);
  const agent = await setupBrowserRuntime({displayBridge: undefined});
  const [listed] = await agent.browsers.list();
  const browser = await agent.browsers.get(listed.id);
  return {...env, agent, browser, calls};
}

const rejectionOf = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

test('the unchanged client sets up on cua\'s service, uses execute, and drives tabs and navigation', {skip: !CLIENT && 'vendor runtime absent: the installed REPL client (BC) is needed for the real-client proof'}, async t => {
  const {browser, calls, pages} = await realClient(t);
  assert.match(await browser.documentation(), new RegExp(`cua browser service ${SERVICE_VERSION.replaceAll('.', '\\.')}`));
  const tab = await browser.tabs.new();
  await tab.goto('https://example.com/a');
  assert.equal(await tab.url(), 'about:blank', 'the fake extension keeps its own tab URL; the page saw the navigation:');
  assert.equal(pages.page(Number(tab.id)).url, 'https://example.com/a');
  assert.ok(calls.includes('setup') && calls.includes('execute'));
  assert.ok(!calls.includes('executeWithRecovery'), 'no credentialRecoveryErrorVersion: the client never asks for the recovery envelope');
});

test('dialog_open reaches model code through the client with the vendor\'s sentence', {skip: !CLIENT && 'vendor runtime absent: the installed REPL client (BC) is needed for the real-client proof'}, async t => {
  const {browser, ext} = await realClient(t);
  const tab = await browser.tabs.new();
  await tab.goto('https://example.com/a');
  ext.cdpEvent({tabId: Number(tab.id)}, 'Page.javascriptDialogOpening', {type: 'confirm', message: 'Sure?', url: 'https://example.com/a'});
  await waitFor(async () => (await rejectionOf(tab.reload()).catch(() => null))?.message?.includes('dialog') ?? false, 'the dialog to block the tab');
  const error = await rejectionOf(tab.reload());
  assert.equal(error.message, 'A confirm JavaScript dialog is active in this tab. Use `tab.getJsDialog()` to get it and dismiss it first.');
  assert.ok(!error.message.includes('invalid recovery response'));
});

test('a dialog is reported, blocks a locator action with dialog_open, and is dismissed through the client (acceptance 4)', {skip: !CLIENT && 'vendor runtime absent: the installed REPL client (BC) is needed for the real-client proof'}, async t => {
  const {browser, ext, pages} = await realClient(t);
  const tab = await browser.tabs.new();
  await tab.goto('https://example.com/dialogs');
  assert.equal(await tab.getJsDialog(), undefined);
  ext.cdpEvent({tabId: Number(tab.id)}, 'Page.javascriptDialogOpening', {type: 'alert', message: 'Hello', url: 'https://example.com/dialogs', hasBrowserHandler: true});
  await waitFor(async () => (await tab.getJsDialog()) != null, 'the dialog to be reported');
  const dialog = await tab.getJsDialog();
  assert.equal(dialog.type, 'alert');
  const blocked = await rejectionOf(tab.playwright.locator('#confirm').click({timeoutMs: 500}));
  assert.match(blocked.message, /^A alert JavaScript dialog is active in this tab\. Use `tab\.getJsDialog\(\)` to get it and dismiss it first\./);
  const dismissing = dialog.dismiss();
  await waitFor(() => pages.sent.some(s => s.method === 'Page.handleJavaScriptDialog'), 'the answer to reach Chrome');
  ext.cdpEvent({tabId: Number(tab.id)}, 'Page.javascriptDialogClosed', {result: true, userInput: ''});
  await dismissing;
  assert.equal(await tab.getJsDialog(), undefined, 'the client reports no dialog as undefined');
  assert.deepEqual(pages.sent.filter(s => s.method === 'Page.handleJavaScriptDialog').map(s => s.params), [{accept: true}]);
});

test('a download and a file chooser through the client: waitForEvent, path() and setFiles() (acceptance 4)', {skip: !CLIENT && 'vendor runtime absent: the installed REPL client (BC) is needed for the real-client proof'}, async t => {
  const {browser, ext, pages} = await realClient(t);
  const tab = await browser.tabs.new();
  await tab.goto('https://example.com/downloads');
  const tabId = Number(tab.id);
  const url = 'https://example.com/files/parity.txt';
  const downloading = tab.playwright.waitForEvent('download', {timeoutMs: 5000});
  await new Promise(resolve => setTimeout(resolve, 50));
  ext.cdpEvent({tabId}, 'Fetch.requestPaused', {requestId: 'R1', frameId: 'F', resourceType: 'Document', request: {url, method: 'GET', headers: {}},
    responseStatusCode: 200, responseHeaders: [{name: 'Content-Disposition', value: 'attachment'}]});
  await waitFor(() => pages.sent.some(s => s.method === 'Fetch.continueResponse' && s.params.requestId === 'R1'), 'the download to be let through');
  ext.downloadCreated({id: 5, url, filename: ''});
  ext.downloadChanged(5, {filename: '/Users/agent/Downloads/parity.txt', state: 'complete'});
  const download = await downloading;
  assert.equal(await download.path(), '/Users/agent/Downloads/parity.txt');

  const choosing = tab.playwright.waitForEvent('filechooser', {timeoutMs: 5000});
  await waitFor(() => pages.sent.some(s => s.method === 'Page.setInterceptFileChooserDialog' && s.params.enabled), 'the chooser interception');
  ext.cdpEvent({tabId}, 'Page.fileChooserOpened', {frameId: 'F', mode: 'selectSingle', backendNodeId: 9});
  const chooser = await choosing;
  assert.equal(chooser.isMultiple(), false);
  await chooser.setFiles(['/tmp/upload.txt']);
  assert.deepEqual(pages.sent.filter(s => s.method === 'DOM.setFileInputFiles').map(s => s.params), [{backendNodeId: 9, files: ['/tmp/upload.txt']}]);
});

test('a later milestone\'s command and a missing tab reach model code as the service\'s rejections', {skip: !CLIENT && 'vendor runtime absent: the installed REPL client (BC) is needed for the real-client proof'}, async t => {
  const {browser} = await realClient(t);
  const tab = await browser.tabs.new();
  assert.equal((await rejectionOf(tab.content.exportYouTubeTranscript())).message, 'Unsupported browser command: tab_content_export_youtube_transcript');
  assert.equal((await rejectionOf(browser.tabs.get('4242'))).message, `Tab not found: 4242. Existing tabs: ${tab.id}||about:blank`);
});

test('timeout and strict-mode rejections cross the client with the vendor\'s sentences', {skip: !CLIENT && 'vendor runtime absent: the installed REPL client (BC) is needed for the real-client proof'}, async t => {
  const {browser} = await realClient(t);
  const tab = await browser.tabs.new();
  const thrown = [];
  const saved = COMMAND_HANDLERS.get('playwright_locator_click');
  COMMAND_HANDLERS.set('playwright_locator_click', async params => {
    const error = params.selector === '#late'
      ? new BrowserServiceError('timeout', SELECTOR_DEADLINE)
      : new BrowserServiceError('strict_mode_violation', STRICT);
    thrown.push(error.code);
    throw error;
  });
  t.after(() => { if (saved) COMMAND_HANDLERS.set('playwright_locator_click', saved); else COMMAND_HANDLERS.delete('playwright_locator_click'); });
  // Until M1b serves playwright_evaluate the client's diagnostics fail, so its tail is the "waiting on" line alone.
  const late = await rejectionOf(tab.playwright.locator('#late').click({timeoutMs: 500}));
  assert.equal(late.message, `${SELECTOR_DEADLINE}\nwaiting on click for selector #late`);
  const strict = await rejectionOf(tab.playwright.locator('.duplicate').click());
  assert.equal(strict.message, `${STRICT}\nwaiting on click for selector .duplicate`);
  assert.deepEqual(thrown, ['timeout', 'strict_mode_violation'], 'each reached the service as its own call');
  for (const error of [late, strict]) {
    assert.equal(error.code, undefined, 'the code stays in the trusted worker');
    assert.ok(!error.message.includes('invalid recovery response'));
  }
});
