// playwright_wait_for_file_chooser and playwright_file_chooser_set_files (src/browser-service/chooser.mjs, the vendor's
// ZO and FO, readable chatgpt-26.928.40906 BS:50034-50093 and BS:49554-49615) through the real host and the fake
// extension: the wait arms Chrome's file chooser interception, answers the chooser Chrome reports with an id and its
// multiplicity, and disarms; setFiles hands the files to the chooser's input with DOM.setFileInputFiles, once.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost, waitFor} from './support/service-on-host.mjs';

const INPUT = 42;

// Scripted pages whose DOM.setFileInputFiles answers as `chrome.setFiles(params)` says (the default: {}).
function chooserPages() {
  const pages = scriptedPages();
  const chrome = {setFiles: () => ({})};
  const cdp = request => {
    if (request.method === 'DOM.setFileInputFiles') {
      pages.sent.push({tabId: request.debuggee.tabId, method: request.method, params: request.params});
      return chrome.setFiles(request.params);
    }
    return pages.cdp(request);
  };
  return {...pages, cdp, chrome};
}

async function tabWithInput(t) {
  const pages = chooserPages();
  const env = await serviceOnHost(t, {pages});
  const browserId = await readyBrowser(env.service);
  const tab = async () => {
    const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
    const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
    await run({type: 'navigate_tab_url', url: 'https://example.com/chooser'});
    return {id, run};
  };
  const {id, run} = await tab();
  const sent = method => pages.sent.filter(s => s.method === method && s.tabId === Number(id)).map(s => s.params);
  // Chrome reporting the chooser the page opened (in the tab's own document, or in a frame's session).
  const opened = ({mode = 'selectSingle', backendNodeId = INPUT, sessionId} = {}) => env.ext.cdpEvent({tabId: Number(id)}, 'Page.fileChooserOpened',
    {frameId: 'F', mode, backendNodeId}, sessionId);
  const armed = () => waitFor(() => sent('Page.setInterceptFileChooserDialog').some(p => p.enabled === true), 'interception to be armed');
  return {...env, pages, run, sent, opened, armed, tab, tabId: id};
}

test('both chooser commands are registered', () => {
  for (const type of ['playwright_wait_for_file_chooser', 'playwright_file_chooser_set_files']) assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
});

test('waitForEvent("filechooser") arms interception, answers the chooser Chrome opens and disarms; setFiles sets its files once', async t => {
  const {run, sent, opened, armed} = await tabWithInput(t);
  const waiting = run({type: 'playwright_wait_for_file_chooser', timeout_ms: 2000});
  await armed();
  opened({mode: 'selectMultiple'});
  const chooser = await waiting;
  assert.equal(typeof chooser.file_chooser_id, 'string');
  assert.equal(chooser.is_multiple, true);
  assert.deepEqual(sent('Page.setInterceptFileChooserDialog'), [{enabled: true}, {enabled: false}]);
  assert.deepEqual(await run({type: 'playwright_file_chooser_set_files', file_chooser_id: chooser.file_chooser_id, files: ['/tmp/a.txt', '/tmp/b.txt']}), {});
  assert.deepEqual(sent('DOM.setFileInputFiles'), [{backendNodeId: INPUT, files: ['/tmp/a.txt', '/tmp/b.txt']}]);
  const again = await rejection(run({type: 'playwright_file_chooser_set_files', file_chooser_id: chooser.file_chooser_id, files: ['/tmp/a.txt']}));
  assert.ok(again instanceof BrowserServiceError);
  assert.equal(again.code, 'file_chooser_not_found');
  assert.equal(again.message, `Unknown file chooser id "${chooser.file_chooser_id}"`);
});

test('the wait times out with the vendor\'s sentence at its budget and disarms; a zero budget arms once and times out', async t => {
  const {run, sent} = await tabWithInput(t);
  const started = Date.now();
  const error = await rejection(run({type: 'playwright_wait_for_file_chooser', timeout_ms: 200}));
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'timeout');
  assert.equal(error.message, 'Timed out after 200ms waiting for file chooser.');
  assert.ok(Date.now() - started < 1500, `bounded by timeout_ms (${Date.now() - started} ms)`);
  const zero = await rejection(run({type: 'playwright_wait_for_file_chooser', timeout_ms: 0}));
  assert.equal(zero.message, 'Timed out after 0ms waiting for file chooser.');
  assert.deepEqual(sent('Page.setInterceptFileChooserDialog'), [{enabled: true}, {enabled: false}, {enabled: true}, {enabled: false}]);
});

test('the wait\'s budget is 3 s by default and the caller\'s up to 120 s', async t => {
  const {run, opened, armed} = await tabWithInput(t);
  const started = Date.now();
  const error = await rejection(run({type: 'playwright_wait_for_file_chooser'}));
  assert.equal(error.message, 'Timed out after 3000ms waiting for file chooser.');
  assert.ok(Date.now() - started >= 2900, 'the default 3 s');
  const lifted = run({type: 'playwright_wait_for_file_chooser', timeout_ms: 500000});
  await armed();
  opened();
  assert.equal((await lifted).is_multiple, false, 'a budget above 120 s is clamped, not refused');
});

test('a chooser in an out-of-process frame is refused with the vendor\'s sentence', async t => {
  const {run, opened, armed} = await tabWithInput(t);
  const waiting = run({type: 'playwright_wait_for_file_chooser', timeout_ms: 2000});
  await armed();
  opened({sessionId: 'OOPIF-SESSION'});
  assert.equal((await rejection(waiting)).message, 'File uploads in out-of-process frames are not supported.');
});

test('setFiles refusals: no files, several files for a single chooser, another tab\'s chooser; Chrome without file access', async t => {
  const {run, opened, armed, tab, pages, sent} = await tabWithInput(t);
  const waiting = run({type: 'playwright_wait_for_file_chooser', timeout_ms: 2000});
  await armed();
  opened();
  const {file_chooser_id: id} = await waiting;
  const set = files => run({type: 'playwright_file_chooser_set_files', file_chooser_id: id, files});
  assert.equal((await rejection(set([]))).message, 'fileChooser.setFiles requires at least one file');
  assert.equal((await rejection(set(['/tmp/a', '/tmp/b']))).message, 'File chooser does not accept multiple files');
  const other = await tab();
  const foreign = await rejection(other.run({type: 'playwright_file_chooser_set_files', file_chooser_id: id, files: ['/tmp/a']}));
  assert.match(foreign.message, new RegExp(`^File chooser "${id}" belongs to tab \\d+$`));
  pages.chrome.setFiles = () => { throw new Error('Not allowed'); };
  assert.equal((await rejection(set(['/tmp/a']))).message,
    'To enable file upload, go to chrome://extensions in Google Chrome, click Details under the cua extension, and enable "Allow access to file URLs."');
  pages.chrome.setFiles = () => { throw new Error('{"code":-32000,"message":"Not allowed"}'); };
  assert.match((await rejection(set(['/tmp/a']))).message, /^To enable file upload/);
  pages.chrome.setFiles = () => { throw new Error('No node with given id found'); };
  assert.equal((await rejection(set(['/tmp/a']))).message, 'No node with given id found', 'other failures pass through');
  pages.chrome.setFiles = () => ({});
  assert.deepEqual(await set(['/tmp/a']), {}, 'a refused or failed setFiles keeps the chooser');
  assert.equal(sent('DOM.setFileInputFiles').length, 4);
});
