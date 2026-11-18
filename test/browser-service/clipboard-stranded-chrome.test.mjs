// The page clipboard bridge's override in a real page, when the bridge cannot remove it (#384 review): Chrome detaches
// the tab during a turn and the next setup disposes the runtime first, so disposal (which never attaches a tab) skips
// it. Ending the debugger session drops the binding's listener and the registered script, but the JavaScript already
// run stays: the page's navigator.clipboard calls would wait forever, and the page cannot tell (the binding function
// stays and calling it throws nothing). The override is recorded as stranded, and the next controller that attaches the
// tab, a later runtime's, removes it. Real headless Chrome (support/real-chrome.mjs; skipped without one), driven by the
// service's own CdpController, Clipboard and bridge over a backend that is a DevTools WebSocket per attach.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {Clipboard} from '../../src/browser-service/clipboard.mjs';
import {StrandedPageClipboards} from '../../src/browser-service/clipboard-bridge.mjs';
import {realChrome} from './support/real-chrome.mjs';
import {waitFor} from './support/real-host.mjs';

// The backend API CdpController drives (backend.mjs BackendApi's shape), over real Chrome: attach opens a debugger
// session on the page, detach closes it; `chromeDetaches()` is Chrome ending the session on its own (onCDPDetach).
function chromeBackend(socketUrl) {
  const listeners = {onCDPEvent: new Set(), onCDPDetach: new Set()};
  let ws = null, id = 0;
  const waiting = new Map();
  const end = () => { ws?.close(); ws = null; for (const w of waiting.values()) w.reject(new Error('Debugger unattached')); waiting.clear(); };
  return {
    addEventListener(name, listener) { listeners[name]?.add(listener); return () => listeners[name]?.delete(listener); },
    async attach(tabId) {
      const socket = new WebSocket(socketUrl);
      await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
      socket.onmessage = ({data}) => {
        const msg = JSON.parse(data);
        if (msg.id == null) { for (const l of listeners.onCDPEvent) l({source: {tabId}, method: msg.method, params: msg.params}); return; }
        const w = waiting.get(msg.id);
        waiting.delete(msg.id);
        if (msg.error) w?.reject(new Error(msg.error.message)); else w?.resolve(msg.result);
      };
      ws = socket;
    },
    async detach() { end(); },
    async executeCdp({method, commandParams, timeoutMs = 10_000}) {
      if (ws == null) throw new Error('Debugger unattached');
      const n = ++id;
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(n); reject(new Error(`Timed out after ${timeoutMs}ms waiting for CDP command ${method}.`)); }, timeoutMs);
        waiting.set(n, {resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); }});
        ws.send(JSON.stringify({id: n, method, params: commandParams}));
      });
    },
    async getCommittedTabUrl() { return undefined; },
    chromeDetaches(tabId) { end(); for (const l of listeners.onCDPDetach) l({tabId}); },
    idle: () => waiting.size === 0,
    close: end,
  };
}

const TAB = 1;
const PAGE_STATE = `(async () => {
  const bridge = globalThis.__browserUseClipboardBridge !== undefined;
  const native = /\\[native code\\]/.test(String(navigator.clipboard.readText));
  const answered = await Promise.race([navigator.clipboard.readText().then(() => 'resolved', () => 'rejected'), new Promise(r => setTimeout(() => r('pending'), 1500))]);
  return {bridge, native, answered};
})()`;

test('a bridge left in a page by a disposal that skipped its detached tab is removed when the next runtime attaches the tab', async t => {
  const chrome = await realChrome(t, {'/page.html': '<!doctype html><title>page</title><p>page</p>'});
  if (chrome == null) return t.skip('no Chrome on this machine');
  await chrome.load('/page.html');
  const stranded = new StrandedPageClipboards();

  // The first runtime installs the bridge, then Chrome detaches the tab and the next setup disposes the runtime.
  const first = chromeBackend(chrome.pageSocketUrl);
  t.after(() => first.close());
  const firstCdp = new CdpController(first);
  stranded.restoreOn(firstCdp);
  const firstClipboard = new Clipboard({stranded});
  await firstClipboard.ensurePageClipboard(firstCdp, {tabId: TAB});
  assert.deepEqual(await chrome.evaluate(PAGE_STATE), {bridge: true, native: false, answered: 'resolved'}, 'the bridge answers the page');
  await waitFor(() => first.idle(), 'the bridge\'s answer to the page acknowledged', 5000);    // else its retry re-attaches the tab
  first.chromeDetaches(TAB);
  await firstClipboard.dispose();
  assert.deepEqual(await chrome.evaluate(PAGE_STATE), {bridge: true, native: false, answered: 'pending'},
    'disposal never attaches the tab, so the override stays for now, and with its session gone nothing answers it');

  // The next runtime's controller attaches the tab for a command of its own: the stranded override is removed.
  const second = chromeBackend(chrome.pageSocketUrl);
  t.after(() => second.close());
  const secondCdp = new CdpController(second);
  stranded.restoreOn(secondCdp);
  await secondCdp.call(TAB, 'Runtime.evaluate', {expression: '1', returnByValue: true});
  await waitFor(async () => !(await chrome.evaluate('globalThis.__browserUseClipboardBridge !== undefined')), 'the stranded bridge removed', 5000);
  const state = await chrome.evaluate(PAGE_STATE);
  assert.equal(state.native, true, 'the page\'s own navigator.clipboard is back');
  assert.notEqual(state.answered, 'pending', 'readText answers (Chrome\'s own answer, resolved or refused)');
});

// A runtime's controller and clipboard over its own debugger session on the page, restoring stranded page sides.
function runtimeOn(t, chrome, stranded) {
  const backend = chromeBackend(chrome.pageSocketUrl);
  t.after(() => backend.close());
  const cdp = new CdpController(backend);
  stranded.restoreOn(cdp);
  return {backend, cdp, clipboard: new Clipboard({stranded})};
}
// The page's own script throws inside the bridge's removal (its cleanup walks the document's frames), and is then fixed.
const BREAK_PAGE = 'globalThis.__qsa = Document.prototype.querySelectorAll; Document.prototype.querySelectorAll = () => { throw new Error("page broken"); }; 1';
const FIX_PAGE = 'Document.prototype.querySelectorAll = globalThis.__qsa; 1';
const bridgeInPage = chrome => chrome.evaluate('globalThis.__browserUseClipboardBridge !== undefined');

test('a recovery the page\'s script fails (exceptionDetails) keeps the record, and a later attach removes the override', async t => {
  const chrome = await realChrome(t, {'/page.html': '<!doctype html><title>page</title><p>page</p>'});
  if (chrome == null) return t.skip('no Chrome on this machine');
  await chrome.load('/page.html');
  const stranded = new StrandedPageClipboards();
  const first = runtimeOn(t, chrome, stranded);
  await first.clipboard.ensurePageClipboard(first.cdp, {tabId: TAB});
  await waitFor(() => first.backend.idle(), 'the installation acknowledged', 5000);
  first.backend.chromeDetaches(TAB);
  await first.clipboard.dispose();
  await chrome.evaluate(BREAK_PAGE);
  const second = runtimeOn(t, chrome, stranded);
  await second.cdp.call(TAB, 'Runtime.evaluate', {expression: '1', returnByValue: true});
  await new Promise(resolve => setTimeout(resolve, 300));
  await waitFor(() => second.backend.idle(), 'the recovery answered', 5000);
  assert.equal(await bridgeInPage(chrome), true, 'the page threw: the override is still there');
  await chrome.evaluate(FIX_PAGE);
  second.backend.chromeDetaches(TAB);
  await second.cdp.call(TAB, 'Runtime.evaluate', {expression: '1', returnByValue: true});
  await waitFor(async () => !(await bridgeInPage(chrome)), 'the override removed at the next attach', 5000);
  assert.equal((await chrome.evaluate(PAGE_STATE)).native, true);
});

test('a disposal whose removal the page\'s script fails (exceptionDetails) records the override for the next runtime', async t => {
  const chrome = await realChrome(t, {'/page.html': '<!doctype html><title>page</title><p>page</p>'});
  if (chrome == null) return t.skip('no Chrome on this machine');
  await chrome.load('/page.html');
  const stranded = new StrandedPageClipboards();
  const first = runtimeOn(t, chrome, stranded);
  await first.clipboard.ensurePageClipboard(first.cdp, {tabId: TAB});
  await waitFor(() => first.backend.idle(), 'the installation acknowledged', 5000);
  await chrome.evaluate(BREAK_PAGE);
  await first.clipboard.dispose();              // the tab is attached: the removal is sent, and the page throws
  assert.equal(await bridgeInPage(chrome), true);
  await chrome.evaluate(FIX_PAGE);
  first.backend.close();
  const second = runtimeOn(t, chrome, stranded);
  await second.cdp.call(TAB, 'Runtime.evaluate', {expression: '1', returnByValue: true});
  await waitFor(async () => !(await bridgeInPage(chrome)), 'the override removed by the next runtime', 5000);
  assert.equal((await chrome.evaluate(PAGE_STATE)).native, true);
});
