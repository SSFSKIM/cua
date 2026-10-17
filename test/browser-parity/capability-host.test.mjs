// The capability host (test/browser-parity/capability-host.mjs): the parity harness's test backend announcing the
// optional capabilities no live host announces (raw CDP, WebMCP, auth handoff, history), proven offline here by
// driving cua's own service through each one's success path over its real socket. The live comparison with the
// vendor runs through the harness (`run --backend capability-host`), not in this suite.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {startCapabilityHost, CAPABILITY_ORIGIN} from './capability-host.mjs';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
import {createBrowserService} from '../../src/browser-service/index.mjs';
import {connect} from '../../src/browser-service/backend.mjs';
import {chromeRoute} from '../../src/chrome/route.mjs';
import {backendPaths} from '../../src/chrome/discovery.mjs';
import {readPointer} from '../../src/runtime/layout.mjs';
import {nativePipeConnect} from '../fixtures/native-pipe.mjs';
import {shortScratch} from '../fixtures/runtime-fixture.mjs';

function serviceOn(t, socketPath) {
  let turn = 1;
  const handlers = new Set();
  const runtime = {
    env: {BROWSER_USE_BACKEND_PATHS: socketPath, BROWSER_USE_AVAILABLE_BACKENDS: 'chrome'},
    get requestMeta() { return {'x-codex-turn-metadata': {session_id: 'capability-session', turn_id: `turn-${turn}`}}; },
    nativePipe: {createConnection: nativePipeConnect},
    addTurnEndedHandler(handler) { handlers.add(handler); return () => handlers.delete(handler); },
  };
  const service = createBrowserService({runtime});
  t.after(() => service.dispose());
  const ready = service.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  return async (type, params = {}) => (await ready, service.handleRpc({method: 'execute', params: {type, ...params}}));
}

async function hostIn(t) {
  const scratch = shortScratch('cua-cap-');
  const host = await startCapabilityHost({home: scratch.dir});
  t.after(async () => { await host.close(); scratch.cleanup(); });
  return {host, home: scratch.dir};
}

test('cua\'s service drives raw CDP, WebMCP, the auth handoff and history to success on the capability host', async t => {
  const {host} = await hostIn(t);
  const execute = serviceOn(t, host.socketPath);
  await execute('get_documentation', {name: 'confirmations'});
  const [browser] = await execute('list_browsers');
  const browserId = browser.id;
  const {id: tabId} = await execute('create_tab', {browser_id: browserId});
  const url = `${CAPABILITY_ORIGIN}/shop`;
  await execute('navigate_tab_url', {browser_id: browserId, tab_id: tabId, url});
  const tab = {browser_id: browserId, tab_id: tabId};

  for (const name of ['capabilities/tab/cdp', 'webmcp', 'capabilities/tab/webmcp', 'capabilities/tab/browserAuth']) await execute('get_documentation', {name});
  const tree = await execute('tab_cdp_call', {...tab, method: 'Page.getFrameTree'});
  assert.equal(tree.frameTree.frame.url, url, 'a raw CDP call reaches the page');
  const {cursor} = await execute('tab_cdp_events', {...tab, limit: 1});
  await execute('tab_cdp_call', {...tab, method: 'Page.reload'});
  const events = await execute('tab_cdp_events', {...tab, after_sequence: cursor, methods: ['Page.frameNavigated'], timeout_ms: 2000});
  assert.ok(events.events.some(e => e.method === 'Page.frameNavigated' && e.params.frame.url === url), 'the reload\'s navigation is read back as a raw event');

  const {tools} = await execute('webmcp_list_tools', tab);
  assert.equal(tools.length, 1);
  assert.match(tools[0].call_name, /^search__/);
  const invoked = await execute('webmcp_invoke_tool', {...tab, tool_name: tools[0].name, registration_id: tools[0].registration_id, input: {q: 'lamps'}});
  assert.deepEqual(invoked, {result: 'results for lamps'});

  const handoff = await execute('tab_browser_auth_handoff', {...tab, origin: CAPABILITY_ORIGIN, fields: [], qr_code: true});
  assert.deepEqual(handoff, {status: 'declined', reason: 'user_took_over'});

  const items = await execute('browser_user_history', {browser_id: browserId, queries: ['lamps', 'desks'], limit: 1});
  assert.deepEqual(items, {items: [{url: `${CAPABILITY_ORIGIN}/history/lamps`, title: 'History: lamps', dateVisited: '2026-10-14T10:00:00.000Z'}]},
    'history answers from the query it was sent, so a request that never reached the host cannot pass');
});

test('the host announces the four capabilities beside the host\'s own viewport, as an extension backend', async t => {
  const {host} = await hostIn(t);
  const backend = await connect(host.socketPath, {nativePipe: {createConnection: nativePipeConnect}});
  t.after(() => backend.close());
  const info = await backend.request('getInfo', {});
  assert.equal(info.type, 'extension');
  assert.equal(info.metadata.extensionInstanceId, host.instanceId);
  assert.deepEqual(info.capabilities.browser.map(c => c.id), ['viewport', 'history']);
  assert.deepEqual(info.capabilities.tab.map(c => c.id), ['cdp', 'webmcp', 'browserAuth']);
});

test('the scratch home puts the host on the cua route with the runtime cloned and the vendor\'s raw CDP switch on', async t => {
  const source = shortScratch('cua-src-');
  t.after(() => source.cleanup());
  mkdirSync(join(source.dir, 'runtimes', 'r1', 'cua_node'), {recursive: true});
  writeFileSync(join(source.dir, 'runtimes', 'r1', 'cua_node', 'marker'), 'runtime');
  writeFileSync(join(source.dir, 'current.json'), JSON.stringify({schema: 1, release: 'r1'}));
  const home = prepareCapabilityHome({source: source.dir});
  t.after(() => home.cleanup());
  assert.equal(readPointer(home.dir), 'r1');
  assert.equal(readFileSync(join(home.dir, 'runtimes', 'r1', 'cua_node', 'marker'), 'utf8'), 'runtime');
  assert.equal(chromeRoute(home.dir), 'cua');
  assert.equal(home.userHome, `${home.dir}.home`, 'the user HOME is the cua home\'s sibling, never inside it');
  assert.ok(existsSync(home.userHome), 'the serve\'s HOME exists, empty, inside the scratch home');
  assert.match(readFileSync(join(home.dir, 'state', 'codex', 'browser', 'config.toml'), 'utf8'), /^full_cdp_access_enabled = true$/m);
  const host = await startCapabilityHost({home: home.dir});
  t.after(() => host.close());
  assert.deepEqual(backendPaths(home.dir), [host.socketPath], 'a launch in the home lists the capability host and nothing else');
  home.cleanup();
  assert.equal(existsSync(home.dir), false);
});

test('a home without an installed runtime is refused', () => {
  const source = shortScratch('cua-src-');
  try {
    assert.throws(() => prepareCapabilityHome({source: source.dir}), /no installed runtime/);
  } finally { source.cleanup(); }
});

test('optional synthetic user tabs are visible and claimable without seeding ordinary capability runs', async t => {
  const scratch=shortScratch('cua-cap-user-');
  const host=await startCapabilityHost({home:scratch.dir,userTabs:[{url:`${CAPABILITY_ORIGIN}/user`,title:'Capability user fixture'}]});
  t.after(async()=>{await host.close();scratch.cleanup();});
  const call=serviceOn(t,host.socketPath);
  const browser=await call('get_browser',{id:'chrome'});
  const result=await call('browser_user_open_tabs',{browser_id:browser.id});
  assert.equal(result.tabs.length,1);
  assert.equal(result.tabs[0].title,'Capability user fixture');
  assert.equal(result.tabs[0].url,`${CAPABILITY_ORIGIN}/user`);
  const claimed=await call('browser_user_claim_tab',{browser_id:browser.id,tab_id:result.tabs[0].id});
  assert.equal(claimed.id,result.tabs[0].id);
});
