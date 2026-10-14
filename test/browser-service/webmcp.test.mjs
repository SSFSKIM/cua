// WebMCP (src/browser-service/webmcp.mjs, the vendor's WebMCP classes and commands, readable chatgpt-26.928.40906
// BS:46309-46905, with its browser notifications BS:65896-66000): refused on cua's host, which announces no webmcp, as
// the vendor refuses it there; for a backend that announces it, the tools the page registered with Chrome's native
// WebMCP are read per secure frame by the vendor's page script (run here for real, in node:vm worlds over a fake
// document.modelContext), each bound to its registration and the tab's generation, invoked only while both hold, and
// reported after each cell when they change.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {STALE, browserNotifications} from '../../src/browser-service/webmcp.mjs';
import {execute, readyBrowser, rejection, serviceOnHost} from './support/service-on-host.mjs';
import {frame, webMcpTab} from './support/webmcp-tab.mjs';

const OVER_LIMITS = /^WebMCP is disabled for this page because the site’s WebMCP configuration exceeds supported limits\./;

test('both WebMCP commands are registered', () => {
  for (const type of ['webmcp_list_tools', 'webmcp_invoke_tool']) assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
});

test('on cua\'s host, which announces no webmcp: listing is refused in its name, invoking is stale, as the vendor answers there', async t => {
  const env = await serviceOnHost(t);
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const unread = await rejection(execute(env.service, {type: 'webmcp_list_tools', browser_id: browserId, tab_id: id}));
  assert.match(unread.message, /^Required documentation has not been read: "confirmations", "webmcp"/, 'its documents first, as the vendor\'s');
  for (const name of ['confirmations', 'webmcp']) await execute(env.service, {type: 'get_documentation', name});
  const before = env.pages.sent.length;
  const listing = await rejection(execute(env.service, {type: 'webmcp_list_tools', browser_id: browserId, tab_id: id}));
  assert.ok(listing instanceof BrowserServiceError);
  assert.equal(listing.code, 'browser_capability_unavailable');
  assert.equal(listing.message, 'cua does not support command "webmcp_list_tools".');
  const invoking = await rejection(execute(env.service, {type: 'webmcp_invoke_tool', browser_id: browserId, tab_id: id, tool_name: 'search', registration_id: 'r1', input: {}}));
  assert.equal(invoking.message, STALE);
  assert.equal(env.pages.sent.length, before, 'no CDP call');
});

const SEARCH = {name: 'search', title: 'Search', description: 'Search the shop', inputSchema: {type: 'object'}, annotations: {readOnlyHint: true}, run: async input => `found ${input.q}`};
const CART = {name: 'cart', inputSchema: '{"type":"object"}', run: async () => 'cart'};

test('listing reads every secure frame\'s tools, its own frames and out-of-process ones, each bound to its registration', async () => {
  const top = frame('F1', 'https://shop.example/', {tools: [SEARCH]});
  const child = frame('F2', 'https://shop.example/side', {parentId: 'F1', tools: [CART]});
  const insecure = frame('F3', 'http://ads.example/', {parentId: 'F1', secure: false, tools: [{name: 'ad', inputSchema: {}, run: async () => 'ad'}]});
  const local = frame('F4', 'http://localhost:3000/', {parentId: 'F1', localhost: true, tools: []});
  const widget = frame('OOP1', 'https://widgets.example/', {tools: [{name: 'chat', inputSchema: {}, run: async () => 'hi'}]});
  const {run, calls, worlds} = webMcpTab({frames: [top, child, insecure, local], oopifs: {OOP1: widget}});
  const {tools} = await run('webmcp_list_tools');
  assert.deepEqual(tools.map(t => [t.name, t.origin, t.pageUrl]), [
    ['search', 'https://shop.example', 'https://shop.example/'],
    ['cart', 'https://shop.example', 'https://shop.example/'],
    ['chat', 'https://widgets.example', 'https://shop.example/'],
  ]);
  const search = tools[0];
  assert.equal(search.call_name, `search__${search.registration_id}`);
  assert.deepEqual({title: search.title, description: search.description, input_schema: search.input_schema, annotations: search.annotations},
    {title: 'Search', description: 'Search the shop', input_schema: {type: 'object'}, annotations: {readOnlyHint: true}});
  assert.deepEqual(tools[1].input_schema, {type: 'object'}, 'a string schema parsed, as the page script does');
  assert.deepEqual(calls.filter(c => c.method === 'WebMCP.enable').map(c => c.target), [{tabId: 5}, {tabId: 5, targetId: 'OOP1'}], 'once per target');
  assert.deepEqual([...worlds.values()].map(w => w.frame.id).sort(), ['F1', 'F2', 'F4', 'OOP1'], 'a world in each secure frame, the insecure one skipped');
  for (const world of worlds.values()) {
    assert.match(world.worldName, /^cua-browser-webmcp-[0-9a-f-]{36}$/);
    assert.equal(world.grant, false);
  }
});

test('a listed tool is invoked in its own world, the backend told; anything not listed in this generation is stale', async () => {
  const top = frame('F1', 'https://shop.example/', {tools: [SEARCH, {...CART, run: async () => ({not: 'a string'})}]});
  const {run, notifications, event} = webMcpTab({frames: [top]});
  assert.equal((await rejection(run('webmcp_invoke_tool', {tool_name: 'search', registration_id: 'nope', input: {}}))).message, STALE, 'nothing listed yet');
  const {tools} = await run('webmcp_list_tools');
  const [search, cart] = tools;
  assert.deepEqual(await run('webmcp_invoke_tool', {tool_name: 'whatever', registration_id: search.registration_id, input: {q: 'socks'}}), {result: 'found socks'});
  assert.deepEqual(notifications, [{parentCallId: 'call-7', tabId: 5, toolName: 'search'}], 'the registration\'s name, not the caller\'s');
  assert.equal((await rejection(run('webmcp_invoke_tool', {tool_name: 'cart', registration_id: cart.registration_id, input: {}}))).message, 'WebMCP executeTool returned an invalid result.');
  event('WebMCP.toolsAdded', {tools: []});
  assert.equal((await rejection(run('webmcp_invoke_tool', {tool_name: 'search', registration_id: search.registration_id, input: {q: 'x'}}))).message, STALE, 'a tool change ends the generation');
  const relisted = (await run('webmcp_list_tools')).tools[0];
  assert.deepEqual(await run('webmcp_invoke_tool', {tool_name: 'search', registration_id: relisted.registration_id, input: {q: 'hats'}}), {result: 'found hats'});
  event('Page.frameNavigated', {frame: {id: 'F1', url: 'https://shop.example/next'}});
  assert.equal((await rejection(run('webmcp_invoke_tool', {tool_name: 'search', registration_id: relisted.registration_id, input: {}}))).message, STALE, 'a navigation too');
});

test('a tool changed in the page after listing is refused by the page script itself', async () => {
  const top = frame('F1', 'https://shop.example/', {tools: [SEARCH]});
  const {run} = webMcpTab({frames: [top]});
  const [search] = (await run('webmcp_list_tools')).tools;
  top.changeTools([{...SEARCH, description: 'changed'}]);
  assert.match((await rejection(run('webmcp_invoke_tool', {tool_name: 'search', registration_id: search.registration_id, input: {}}))).message, /WebMCP tool registration is stale/);
});

test('a page over the limits has WebMCP disabled until its main frame navigates', async () => {
  const many = Array.from({length: 101}, (_, i) => ({name: `t${i}`, inputSchema: {}, run: async () => ''}));
  const top = frame('F1', 'https://shop.example/', {tools: many});
  const {run, event} = webMcpTab({frames: [top]});
  assert.match((await rejection(run('webmcp_list_tools'))).message, OVER_LIMITS);
  top.changeTools([SEARCH]);
  assert.match((await rejection(run('webmcp_list_tools'))).message, OVER_LIMITS, 'still disabled');
  assert.match((await rejection(run('webmcp_invoke_tool', {tool_name: 'search', registration_id: 'r', input: {}}))).message, OVER_LIMITS);
  event('Page.frameNavigated', {frame: {id: 'F1', url: 'https://shop.example/'}});
  assert.deepEqual((await run('webmcp_list_tools')).tools.map(t => t.name), ['search']);
  const big = frame('F1', 'https://shop.example/', {tools: [{name: 'big', description: 'x'.repeat(70000), inputSchema: {}, run: async () => ''}]});
  assert.match((await rejection(webMcpTab({frames: [big]}).run('webmcp_list_tools'))).message, OVER_LIMITS, 'over 64 KiB of descriptors');
});

test('a backend that does not announce webmcp is refused in its own name', async () => {
  const {run, calls} = webMcpTab({frames: [frame('F1', 'https://shop.example/', {tools: [SEARCH]})], capabilities: [{id: 'browserAuth'}]});
  const error = await rejection(run('webmcp_list_tools'));
  assert.equal(error.code, 'browser_capability_unavailable');
  assert.equal(error.message, 'MAWS does not support command "webmcp_list_tools".');
  assert.deepEqual(calls, []);
});

test('after a cell: the tools a session has not been shown, a changed tool list, and tools that went away are notified once', async () => {
  const top = frame('F1', 'https://shop.example/', {tools: [SEARCH]});
  const tab = webMcpTab({frames: [top]});
  const notify = () => browserNotifications([tab.session]);
  assert.equal(await notify(), '', 'no tab tracked, no event');
  tab.session.tabs.events.push({type: 'tab_acquired', tabId: 5, origin: 'external'});
  const first = await notify();
  assert.match(first, /^Browser notifications:\n\nWebMCP tools are available in tab 5:\n\n```json\n/);
  const listed = JSON.parse(first.split('```json\n')[1].split('\n```')[0]);
  assert.deepEqual(listed.map(t => [t.name.startsWith('search__'), t.inputSchema, t.pageUrl, 'call_name' in t]), [[true, {type: 'object'}, 'https://shop.example/', false]], 'named by call name');
  assert.equal(await notify(), '', 'nothing new');
  tab.session.api.pageEvents.push({version: 1, type: 'webmcp_changed', tabId: 5, session_id: 'session-a'});
  assert.equal(await notify(), '', 'an event without a change says nothing');
  top.changeTools([SEARCH, CART]);
  tab.event('WebMCP.toolsAdded', {tools: []});
  assert.match(await notify(), /WebMCP tools are available in tab 5:[\s\S]*"name":"cart__/);
  top.changeTools([]);
  tab.event('WebMCP.toolsRemoved', {tools: []});
  assert.equal(await notify(), 'Browser notifications:\n\nWebMCP tools are no longer available in tab 5.\n');
  tab.setSession('session-b');
  top.changeTools([SEARCH]);
  assert.match(await notify(), /available in tab 5/, 'another session is shown the tab\'s tools in turn');
});

test('the after-cell hook is registered once per service and emits nothing where no backend announces webmcp', async t => {
  const hooks = [], items = [];
  const {service} = await serviceOnHost(t, {runtimeHooks: {
    addAfterSubmittedCodeHook(hook) { hooks.push(hook); return () => {}; },
    emitContentItem(item) { items.push(item); },
  }});
  await readyBrowser(service);
  await service.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  assert.equal(hooks.length, 1, 'once, however many setups');
  assert.equal(hooks[0].timeoutMs, 12000);
  const [browser] = await service.handleRpc({method: 'execute', params: {type: 'list_browsers'}});
  const {id} = await execute(service, {type: 'create_tab', browser_id: browser.id});
  await execute(service, {type: 'get_tab', browser_id: browser.id, tab_id: id});
  await hooks[0].run();
  assert.deepEqual(items, []);
});
