// The service's REPL contract (setup, execute, executeWithRecovery) and the M1a commands, driven through handleRpc
// against the real host program and the fake cua extension (test/browser-service/support/service-on-host.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMMAND_HANDLERS, SERVICE_VERSION, createBrowserService} from '../../src/browser-service/index.mjs';
import {API_MANIFEST} from '../../src/browser-service/manifest.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {execute, readyBrowser, rejection, serviceOnHost, waitFor} from './support/service-on-host.mjs';

const M1A_TYPES = ['list_browsers', 'get_browser', 'get_default_browser', 'get_browser_for_url', 'get_browser_documentation',
  'get_documentation', 'create_tab', 'get_tab', 'list_tabs', 'selected_tab', 'close_tab', 'mark_tab', 'name_session',
  'navigate_tab_url', 'navigate_tab_back', 'navigate_tab_forward', 'navigate_tab_reload', 'browser_user_open_tabs',
  'browser_user_claim_tab', 'tab_manual_handoff_request'];

test('the service version is the VERSION file the wrapper\'s guard reads', () => {
  assert.equal(readFileSync(new URL('../../src/browser-service/VERSION', import.meta.url), 'utf8').trim(), SERVICE_VERSION);
  assert.match(SERVICE_VERSION, /^\d+\.\d+\.\d+$/);
});

test('setup answers the manifest and the disabled members, and no credential recovery version', async t => {
  const {service} = await serviceOnHost(t, {env: {BROWSER_USE_DISABLE_API_MEMBERS: 'Tab.cua, Tab.dom_cua'}});
  const answer = await service.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  assert.deepEqual(Object.keys(answer).sort(), ['apiManifest', 'disabledMemberIds']);
  assert.deepEqual(answer.apiManifest, API_MANIFEST);
  assert.deepEqual(answer.disabledMemberIds, ['Tab.cua', 'Tab.dom_cua']);
});

test('the requests other than setup, execute and executeWithRecovery are refused; execute before setup is refused', async t => {
  const {service} = await serviceOnHost(t);
  assert.equal((await rejection(execute(service, {type: 'list_browsers'}))).message, 'Browser runtime has not been initialized');
  for (const method of ['dispose', 'constructor', 'toString', '__proto__'])
    assert.equal((await rejection(service.handleRpc({method, params: {}}))).message, 'Unsupported browser service request', method);
  assert.match((await rejection(service.handleRpc({method: 'setup', params: {environment: 'cloud'}}))).message, /cloud/);
});

test('every M1a wire type is registered in COMMAND_HANDLERS, the map execute dispatches through', () => {
  assert.ok(COMMAND_HANDLERS instanceof Map);
  for (const type of M1A_TYPES) assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
});

test('a type without a handler rejects unsupported_command naming it; removing a handler does the same', async t => {
  const {service} = await serviceOnHost(t);
  const browserId = await readyBrowser(service);
  for (const type of ['tab_content_export_markdown', 'no_such_command']) {
    const error = await rejection(execute(service, {type, browser_id: browserId, tab_id: '1'}));
    assert.ok(error instanceof BrowserServiceError);
    assert.equal(error.code, 'unsupported_command');
    assert.match(error.message, new RegExp(type));
  }
  const handler = COMMAND_HANDLERS.get('list_tabs');
  COMMAND_HANDLERS.delete('list_tabs');
  t.after(() => COMMAND_HANDLERS.set('list_tabs', handler));
  assert.equal((await rejection(execute(service, {type: 'list_tabs', browser_id: browserId}))).code, 'unsupported_command');
});

test('a command without a handler that requires documentation rejects unsupported_command first, before any documentation is read', async t => {
  const {service} = await serviceOnHost(t);
  await service.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  for (const type of ['webmcp_list_tools', 'webmcp_invoke_tool']) {
    const handler = COMMAND_HANDLERS.get(type);
    COMMAND_HANDLERS.delete(type);
    t.after(() => COMMAND_HANDLERS.set(type, handler));
    const error = await rejection(execute(service, {type, browser_id: '1', tab_id: '1'}));
    assert.equal(error.code, 'unsupported_command', `${type}: ${error.message}`);
    assert.equal(error.message, `Unsupported browser command: ${type}`);
  }
});

test('executeWithRecovery wraps a value as {ok:true, value} and rejects exactly as execute does, never {ok:false}', async t => {
  const {service} = await serviceOnHost(t);
  const browserId = await readyBrowser(service);
  assert.deepEqual(await service.handleRpc({method: 'executeWithRecovery', params: {type: 'list_tabs', browser_id: browserId}}), {ok: true, value: {tabs: []}});
  const viaExecute = await rejection(execute(service, {type: 'get_tab', browser_id: browserId, tab_id: '4242'}));
  const viaRecovery = await rejection(service.handleRpc({method: 'executeWithRecovery', params: {type: 'get_tab', browser_id: browserId, tab_id: '4242'}}));
  assert.equal(viaRecovery.message, viaExecute.message);
  assert.equal(viaRecovery.code, 'tab_not_found');
  assert.equal(viaRecovery.message, 'Tab not found: 4242. Existing tabs: none');
});

test('browsers: listed in the vendor\'s shape, selected by id, type or family, by default and for a URL', async t => {
  const {service, ext} = await serviceOnHost(t);
  await service.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  const listed = await execute(service, {type: 'list_browsers'});
  assert.equal(listed.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(listed[0])), {family: 'chrome', id: listed[0].id, name: 'cua', type: 'extension', metadata: {extensionInstanceId: ext.instanceId}});
  const selected = await execute(service, {type: 'get_browser', id: listed[0].id});
  assert.deepEqual(selected.capabilities.browser.map(c => c.id), ['viewport'], 'the host announces the viewport capability');
  assert.deepEqual(selected.capabilities.tab, []);
  assert.equal(selected.id, listed[0].id);
  for (const id of ['extension', 'chrome']) assert.equal((await execute(service, {type: 'get_browser', id})).id, listed[0].id, id);
  assert.equal((await execute(service, {type: 'get_default_browser'})).id, listed[0].id);
  assert.equal((await execute(service, {type: 'get_browser_for_url', url: 'https://example.com/'})).id, listed[0].id);
  const missing = await rejection(execute(service, {type: 'get_browser', id: '999'}));
  assert.equal(missing.code, 'browser_not_found');
  assert.equal(missing.message, 'Browser is not available: 999');
  assert.equal((await rejection(execute(service, {type: 'list_tabs'}))).message, 'Browser ID must be provided');
});

test('the launch\'s disabled capabilities are left out of a selected browser', async t => {
  const {service} = await serviceOnHost(t, {env: {BROWSER_USE_DISABLE_BROWSER_CAPABILITIES: 'viewport'}});
  const browserId = await readyBrowser(service);
  assert.deepEqual((await execute(service, {type: 'get_browser', id: browserId})).capabilities, {browser: [], tab: []});
});

test('documentation: the selected browser\'s carries the service marker; named documents are read, unknown ones refused', async t => {
  const {service} = await serviceOnHost(t);
  const browserId = await readyBrowser(service);
  const text = await execute(service, {type: 'get_browser_documentation', browser_id: browserId});
  assert.match(text, /^# Selected Browser$/m);
  assert.ok(text.includes(`cua browser service ${SERVICE_VERSION}`));
  assert.match(text, /- `viewport`: /);
  assert.match(await execute(service, {type: 'get_documentation', name: 'capabilities/browser/viewport'}), /^# Browser Capability: viewport/);
  assert.equal((await rejection(execute(service, {type: 'get_documentation', name: 'chrome-troubleshooting'}))).message, 'Documentation is not available: chrome-troubleshooting');
});

test('tabs: created, read, listed, selected, marked and closed through the host', async t => {
  const {service, ext} = await serviceOnHost(t);
  const browserId = await readyBrowser(service);
  const created = await execute(service, {type: 'create_tab', browser_id: browserId});
  assert.deepEqual(created, {id: '100'});
  assert.deepEqual(await execute(service, {type: 'get_tab', browser_id: browserId, tab_id: '100'}), {id: '100', title: '', url: 'about:blank'});
  const listed = await execute(service, {type: 'list_tabs', browser_id: browserId});
  assert.deepEqual(JSON.parse(JSON.stringify(listed)), {tabs: [{id: '100', url: 'about:blank', title: ''}]});
  assert.deepEqual(await execute(service, {type: 'selected_tab', browser_id: browserId}), {id: '100'});
  assert.deepEqual(await execute(service, {type: 'mark_tab', browser_id: browserId, tab_id: '100', status: 'deliverable'}), {});
  assert.equal((await rejection(execute(service, {type: 'get_tab', browser_id: browserId, tab_id: 'x'}))).message, 'Expected a positive integer');
  assert.deepEqual(await execute(service, {type: 'close_tab', browser_id: browserId, tab_id: '100'}), {});
  await waitFor(() => !ext.state.tabs.has(100), 'the tab to close');
  assert.equal((await rejection(execute(service, {type: 'close_tab', browser_id: browserId, tab_id: '0'}))).message, 'close_tab requires a positive integer tab_id');
  assert.deepEqual(await execute(service, {type: 'selected_tab', browser_id: browserId}), {}, 'no tab is no selected tab, not an error');
});

test('the session is named on the host; an empty name is refused before it is sent', async t => {
  const {service, ext} = await serviceOnHost(t);
  const browserId = await readyBrowser(service);
  await execute(service, {type: 'create_tab', browser_id: browserId});
  assert.deepEqual(await execute(service, {type: 'name_session', browser_id: browserId, name: '  Research  '}), {});
  assert.ok(ext.calls.some(c => c.method === 'group.title' && c.params.title === 'Research'));
  assert.equal((await rejection(execute(service, {type: 'name_session', browser_id: browserId, name: '  '}))).message, 'name_session requires a name');
});

test('the user\'s tabs are listed and claimed in the vendor\'s shapes', async t => {
  const {service} = await serviceOnHost(t, {fake: {tabs: [{url: 'https://user.example/', title: 'Mine'}]}});
  const browserId = await readyBrowser(service);
  const open = await execute(service, {type: 'browser_user_open_tabs', browser_id: browserId});
  assert.deepEqual(open, {tabs: [{id: '100', title: 'Mine', url: 'https://user.example/'}]});
  assert.deepEqual(await execute(service, {type: 'browser_user_claim_tab', browser_id: browserId, tab_id: '100'}), {id: '100', title: 'Mine', url: 'https://user.example/'});
  assert.deepEqual(await execute(service, {type: 'browser_user_open_tabs', browser_id: browserId}), {tabs: []}, 'a claimed tab is no longer the user\'s');
});

test('a manual handoff request is refused on an extension backend with the vendor\'s sentence', async t => {
  const {service} = await serviceOnHost(t);
  const browserId = await readyBrowser(service);
  const error = await rejection(execute(service, {type: 'tab_manual_handoff_request', browser_id: browserId, tab_id: '100'}));
  assert.equal(error.code, 'browser_capability_unavailable');
  assert.equal(error.message, 'cua does not support command "tab_manual_handoff_request".');
});

test('a tab acquired in an earlier turn is claimed again before the next turn\'s command, as the vendor does', async t => {
  const env = await serviceOnHost(t);
  const {service} = env;
  const browserId = await readyBrowser(service);
  await execute(service, {type: 'create_tab', browser_id: browserId});
  await execute(service, {type: 'mark_tab', browser_id: browserId, tab_id: '100', status: 'handoff'});
  await env.turnEnded();
  env.setTurn({session_id: 'session-a', turn_id: 'turn-2'});
  const before = env.requests().length;
  await execute(service, {type: 'get_tab', browser_id: browserId, tab_id: '100'});
  assert.deepEqual(env.requests().slice(before), ['claimUserTab', 'getTabs']);
  const again = env.requests().length;
  await execute(service, {type: 'get_tab', browser_id: browserId, tab_id: '100'});
  assert.deepEqual(env.requests().slice(again), ['getTabs'], 'once per turn');
});

test('the turn\'s end detaches the turn\'s tabs before the host hears turnEnded, which closes an unmarked created tab', async t => {
  const env = await serviceOnHost(t);
  const {service, ext} = env;
  const browserId = await readyBrowser(service);
  await execute(service, {type: 'create_tab', browser_id: browserId});
  await execute(service, {type: 'navigate_tab_url', browser_id: browserId, tab_id: '100', url: 'https://example.com/a'});
  assert.ok(ext.state.held.has('tab:100'));
  assert.equal(env.turnHandlerCount(), 1, 'one turn-ended hook per setup');
  const before = env.requests().length;
  await env.turnEnded();
  const sent = env.requests().slice(before);
  assert.ok(sent.indexOf('detach') >= 0 && sent.indexOf('detach') < sent.indexOf('turnEnded'), sent.join(','));
  await waitFor(() => !ext.state.tabs.has(100), 'the unmarked created tab to close');
});

test('a JavaScript dialog opening in an attached tab blocks its commands with dialog_open and the vendor\'s sentence', async t => {
  const {service, ext} = await serviceOnHost(t);
  const browserId = await readyBrowser(service);
  await execute(service, {type: 'create_tab', browser_id: browserId});
  await execute(service, {type: 'navigate_tab_url', browser_id: browserId, tab_id: '100', url: 'https://example.com/a'});
  ext.cdpEvent({tabId: 100}, 'Page.javascriptDialogOpening', {type: 'alert', message: 'hello', url: 'https://example.com/a'});
  await new Promise(resolve => setTimeout(resolve, 20));
  const error = await rejection(execute(service, {type: 'navigate_tab_reload', browser_id: browserId, tab_id: '100'}));
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'dialog_open');
  assert.equal(error.message, 'A alert JavaScript dialog is active in this tab. Use `tab.getJsDialog()` to get it and dismiss it first.');
  assert.equal((await rejection(execute(service, {type: 'close_tab', browser_id: browserId, tab_id: '100'}))).code, 'dialog_open');
});

test('a second setup disposes the first runtime: its connections close and its turn-ended hook is removed', async t => {
  const env = await serviceOnHost(t);
  const {service} = env;
  await readyBrowser(service);
  assert.equal(env.turnHandlerCount(), 1);
  const browserId = await readyBrowser(service);
  assert.equal(env.turnHandlerCount(), 1);
  assert.deepEqual(await execute(service, {type: 'list_tabs', browser_id: browserId}), {tabs: []});
});

test('the module\'s own handleRpc serves the trusted worker\'s nodeRepl', async t => {
  const own = await import('../../src/browser-service/index.mjs');
  assert.equal(typeof own.handleRpc, 'function');
  assert.equal(typeof createBrowserService, 'function');
  const saved = globalThis.nodeRepl;
  globalThis.nodeRepl = {env: {BROWSER_USE_BACKEND_PATHS: ''}, requestMeta: {}, addTurnEndedHandler: () => () => {}};
  t.after(() => { globalThis.nodeRepl = saved; });
  await own.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  assert.deepEqual(await own.handleRpc({method: 'execute', params: {type: 'list_browsers'}}), []);
});
