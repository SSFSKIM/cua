// A tab whose renderer gets no CPU (#384: a hidden agent tab under heavy load): Chrome's browser process still answers
// (the debugger attaches and detaches, tabs close), but nothing that runs in the page does, and the extension's page
// guard (chrome.scripting) does not either. The host times such a command out at its limit and detaches the tab. The
// service must spend one command's budget on it at most when it tidies up afterwards: the turn's end removes the page
// clipboard bridge with one budget for the whole removal, and a later setup disposes the previous runtime without ever
// attaching the tab again and within its own short budget. Before #384's fix each removal step had a budget of its own
// and re-attached the detached tab, so one stall cost two more timeouts, the second inside the next setup. A page side
// the dispose left is removed by the next runtime when it attaches the tab (clipboard-stranded-chrome.test.mjs shows
// the page itself in real Chrome).
// Through the real host and the fake extension (test/browser-service/support/service-on-host.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ACTION_MS} from '../../src/browser-service/budgets.mjs';
import {DISPOSE_CLEANUP_MS} from '../../src/browser-service/clipboard-bridge.mjs';
import {execute, readyBrowser, scriptedPages, serviceOnHost, waitFor} from './support/service-on-host.mjs';

// The commands a starved renderer never answers: the page's own and the ones an attach sends it.
const RENDERER_METHODS = ['Runtime.evaluate', 'Runtime.removeBinding', 'Page.removeScriptToEvaluateOnNewDocument',
  'Emulation.setFocusEmulationEnabled', 'Page.enable', 'Target.setAutoAttach'];

// A tab with the page clipboard bridge installed (a clipboard command installs it), then starved unless `starve` is false.
async function starvedTabWithBridge(t, {starve = true} = {}) {
  const pages = scriptedPages();
  const cdp = request => {
    if (request.method === 'Page.addScriptToEvaluateOnNewDocument') return {identifier: 'script-1'};
    if (request.method === 'Runtime.evaluate' && /^globalThis\.__browserUseClipboardBridge\?\.bindingName === /.test(request.params.expression))
      return {result: {type: 'boolean', value: true}};
    return pages.cdp(request);
  };
  const env = await serviceOnHost(t, {pages: {...pages, cdp}});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  await execute(env.service, {type: 'tab_clipboard_write_text', browser_id: browserId, tab_id: id, text: 'x'});
  const {ext} = env;
  if (starve) {
    ext.stall('tabs.guard');
    for (const method of RENDERER_METHODS) ext.holdCdp(method);
  }
  const from = ext.calls.length;
  // What the host asked of the extension for the tab since it starved: CDP commands by method, and attaches.
  const since = () => {
    const calls = ext.calls.slice(from);
    return {
      commands: calls.filter(c => c.method === 'debugger.sendCommand' && c.params.debuggee?.tabId === Number(id)).map(c => c.params.method),
      attaches: calls.filter(c => c.method === 'debugger.attach' && c.params.tabId === Number(id)).length,
    };
  };
  return {...env, tabId: Number(id), since};
}

const timed = async work => { const start = Date.now(); await work(); return Date.now() - start; };

test('the turn\'s end spends one budget on a starved tab: the bridge\'s removal never attaches it again', async t => {
  const env = await starvedTabWithBridge(t);
  const ms = await timed(() => env.turnEnded());
  const {commands, attaches} = env.since();
  assert.deepEqual(commands, ['Runtime.evaluate'], 'the first removal step only; the host timed it out and detached the tab');
  assert.equal(attaches, 0, 'the detached tab is not attached again to finish the removal');
  assert.ok(ms < DEFAULT_ACTION_MS + 900, `the turn's end took ${ms} ms, more than one action budget`);
  const setup = await timed(() => env.service.handleRpc({method: 'setup', params: {environment: 'codex-app'}}));
  assert.ok(setup < DISPOSE_CLEANUP_MS + 900, `the next setup took ${setup} ms`);
  assert.equal(env.since().attaches, 0, 'nor by the next setup\'s dispose');
});

test('a second setup disposes the previous runtime without attaching a starved tab, within the dispose budget', async t => {
  const env = await starvedTabWithBridge(t);
  // A new kernel (js_reset, or a cell's timeout) sets the service up again while the turn's tab is still held.
  const ms = await timed(() => env.service.handleRpc({method: 'setup', params: {environment: 'codex-app'}}));
  const {commands, attaches} = env.since();
  assert.equal(attaches, 0, 'the dispose never attaches a tab');
  assert.ok(!commands.includes('Emulation.setFocusEmulationEnabled'), commands.join(','));
  assert.ok(commands.length <= 1, `one removal command at most, cut short by the dispose budget: ${commands.join(',')}`);
  assert.ok(ms < DISPOSE_CLEANUP_MS + 900, `the setup took ${ms} ms, waiting on the starved tab`);
});

test('a tab detached during the turn whose page answers again is attached once to have the bridge removed at the turn\'s end', async t => {
  const env = await starvedTabWithBridge(t, {starve: false});
  env.ext.addForeignFrame(env.tabId);           // Chrome detaches the tab; the guard's sweep on the next attach clears it
  await new Promise(resolve => setTimeout(resolve, 20));
  await env.turnEnded();
  const {commands, attaches} = env.since();
  assert.equal(attaches, 1);
  const removal = ['Runtime.evaluate', 'Page.removeScriptToEvaluateOnNewDocument', 'Runtime.removeBinding'];
  assert.deepEqual(commands.filter(m => removal.includes(m)), removal, 'after the attach\'s own setup commands');
});

test('a bridge the dispose skipped (its tab detached) is removed from the page when the next runtime attaches the tab', async t => {
  const env = await starvedTabWithBridge(t, {starve: false});
  const {ext, service, tabId} = env;
  const bindingName = ext.calls.filter(c => c.method === 'debugger.sendCommand' && c.params.method === 'Runtime.addBinding').at(-1).params.params.name;
  const browserId = (await execute(service, {type: 'list_browsers'}))[0].id;
  await execute(service, {type: 'mark_tab', browser_id: browserId, tab_id: String(tabId), status: 'deliverable'});   // released open
  ext.addForeignFrame(tabId);                   // Chrome detaches the tab during the turn
  await new Promise(resolve => setTimeout(resolve, 20));
  await service.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  const removals = () => ext.calls.filter(c => c.method === 'debugger.sendCommand' && c.params.method === 'Runtime.evaluate'
    && c.params.params.expression.includes(JSON.stringify(bindingName)) && c.params.params.expression.includes('cleanup()'));
  assert.equal(removals().length, 0, 'the dispose did not attach the tab');
  const next = (await execute(service, {type: 'list_browsers'}))[0].id;
  await execute(service, {type: 'browser_user_claim_tab', browser_id: next, tab_id: String(tabId)});
  await execute(service, {type: 'navigate_tab_reload', browser_id: next, tab_id: String(tabId)});
  await waitFor(() => removals().length === 1, 'the stranded page side removed by the next runtime', 5000);
});
