// S0 spike harness (scripts/probe/chrome/no-header.mjs): the network switch of the vendor launch environment, the
// recording stub backend that answers as cua's host will, and the judge that turns a run into PASS/FAIL per question.
// No runtime is launched here; the judge is fed synthetic runs shaped like the harness's own.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vendorEnv} from '../scripts/probe/chrome/vendor-layer.mjs';
import {cuaInfo, createStubBackend, judgeNoHeader} from '../scripts/probe/chrome/no-header.mjs';

const paths = {nodeRepl: '/r/node_repl', node: '/r/node', moduleDir: '/r/mods', codexCli: '/r/codex'};
const envFor = extra => vendorEnv({ambient: {HOME: '/h', BROWSER_USE_DISABLE_AMBIENT_NETWORK: '1'}, paths, codexHome: '/c', backendPath: '/s.sock', ...extra});

test('the network switch: off sets the vendor ambient-network switch, default leaves it out even when inherited', () => {
  assert.equal(envFor({network: 'off'}).BROWSER_USE_DISABLE_AMBIENT_NETWORK, '1');
  assert.equal('BROWSER_USE_DISABLE_AMBIENT_NETWORK' in envFor({network: 'default'}), false);
  assert.equal(envFor({}).BROWSER_USE_DISABLE_AMBIENT_NETWORK, '1', 'M7 runs keep their network-off default');
  assert.throws(() => envFor({network: 'on'}), /network/);
  assert.equal(envFor({network: 'default', availableBackends: 'chrome'}).BROWSER_USE_AVAILABLE_BACKENDS, 'chrome');
  assert.equal('BROWSER_USE_AVAILABLE_BACKENDS' in envFor({}), false);
});

test('cuaInfo is the host getInfo: no header field and no extensionId unless a control asks for the field', () => {
  const info = cuaInfo({instanceId: 'i-1'});
  assert.deepEqual(info, {type: 'extension', family: 'chrome', name: 'cua', version: '0.0.0-s0', capabilities: {browser: [], tab: []}, metadata: {extensionInstanceId: 'i-1'}});
  assert.equal(cuaInfo({instanceId: 'i-1', agentRequestHeaderEnabled: false}).agentRequestHeaderEnabled, false);
});

test('the stub backend answers the session methods, records arrivals, and answers the rest with the vendor fallback string', async () => {
  let t = 100;
  const stub = createStubBackend({info: cuaInfo({instanceId: 'i-1'}), now: () => t});
  assert.equal((await stub.handleRequest('getInfo', {})).name, 'cua');
  t = 150;
  const created = await stub.handleRequest('createTab', {session_id: 's', turn_id: 't'});
  assert.ok(Number.isInteger(created.id));
  assert.ok((await stub.handleRequest('getTabs', {})).some(tab => tab.id === created.id));
  assert.deepEqual(await stub.handleRequest('attach', {tabId: created.id}), {});
  await assert.rejects(stub.handleRequest('executeCdp', {method: 'Runtime.evaluate'}), e => e.code === 1);
  await assert.rejects(stub.handleRequest('getUserTabs', {}), e => e.code === -1 && e.message === 'No handler registered for method: getUserTabs');
  assert.deepEqual(stub.log.slice(0, 2), [{method: 'getInfo', at: 100}, {method: 'createTab', at: 150}]);
});

// A run as the harness records it: per-cell results and the stub's arrival log (ms since the child was spawned).
function run({label, network = 'default', log = [], cells = {}, extra = {}}) {
  return {label, network, backendLog: log, cells, timing: {spawnToHandshakeMs: 900}, ...extra};
}
const reached = ['getInfo', 'getTabs', 'getUserTabs', 'createTab', 'attach', 'executeCdp', 'turnEnded'].map((method, i) => ({method, at: 1000 + i}));
const goodNoHeader = network => run({label: 'no-header', network, log: reached, cells: {listBrowsers: {result: {browsers: [{id: '1', type: 'extension'}]}}, listTabs: {result: {tabs: []}}, createBrowserTab: {result: {error: 's0 stub serves no CDP'}}}});
const goodControl = network => run({label: 'header-control', network, log: [{method: 'getInfo', at: 1000}, {method: 'turnEnded', at: 1200}], cells: {listBrowsers: {result: {browsers: [{id: '1'}]}}, listTabs: {result: {error: 'Codex auth token is unavailable'}}, createBrowserTab: {result: {error: 'Codex auth token is unavailable'}}}});
const goodDiscovery = network => run({label: 'discovery', network, cells: {
  listBeforeListeners: {result: {elapsedMs: 40, browsers: [{metadata: {extensionInstanceId: 'live'}}]}},
  listAfterListeners: {result: {elapsedMs: 60, browsers: ['live', 'absent', 'stale'].map(id => ({metadata: {extensionInstanceId: id}}))}},
  listWithMuteListener: {result: {elapsedMs: 5050, browsers: ['live', 'absent', 'stale'].map(id => ({metadata: {extensionInstanceId: id}}))}},
}, extra: {instanceIds: {live: 'live', absent: 'absent', stale: 'stale'}}});
const status = (scenarios, id) => scenarios.find(s => s.id === id)?.status;

test('judge: default network names question (a), off names (b); omission reaching the backend passes', () => {
  for (const [network, id] of [['default', 's0-a-no-header-default-network'], ['off', 's0-b-no-header-network-off']]) {
    const scenarios = judgeNoHeader({network, runs: {'no-header': goodNoHeader(network), 'header-control': goodControl(network), discovery: goodDiscovery(network)}});
    assert.equal(status(scenarios, id), 'PASS', id);
    assert.equal(status(scenarios, 's0-control-header-field-present'), 'PASS');
    assert.equal(status(scenarios, 's0-c-backend-paths-live-and-dead'), 'PASS');
    assert.equal(status(scenarios, 's0-c-mute-listener-cost'), 'PASS');
  }
});

test('judge: an identity refusal or a session request that never arrives fails question (a)', () => {
  const refused = goodNoHeader('default');
  refused.cells.listTabs = {result: {error: 'Browser request-header policy requires caller identity.'}};
  const missing = goodNoHeader('default');
  missing.backendLog = missing.backendLog.filter(l => l.method !== 'attach');
  for (const bad of [refused, missing]) {
    const scenarios = judgeNoHeader({network: 'default', runs: {'no-header': bad, 'header-control': goodControl('default'), discovery: goodDiscovery('default')}});
    assert.equal(status(scenarios, 's0-a-no-header-default-network'), 'FAIL');
  }
});

test('judge: the control fails when the field present still lets session requests through', () => {
  const leaky = goodControl('default');
  leaky.backendLog.push({method: 'getTabs', at: 1100});
  leaky.cells.listTabs = {result: {tabs: []}};
  const scenarios = judgeNoHeader({network: 'default', runs: {'no-header': goodNoHeader('default'), 'header-control': leaky, discovery: goodDiscovery('default')}});
  assert.equal(status(scenarios, 's0-control-header-field-present'), 'FAIL');
});

test('judge: (c) fails when a dead path delays the live one past ~1 s or a late listener is not found', () => {
  const slow = goodDiscovery('default');
  slow.cells.listBeforeListeners.result.elapsedMs = 1600;
  const blind = goodDiscovery('default');
  blind.cells.listAfterListeners.result.browsers = [{metadata: {extensionInstanceId: 'live'}}];
  for (const bad of [slow, blind]) {
    const scenarios = judgeNoHeader({network: 'default', runs: {'no-header': goodNoHeader('default'), 'header-control': goodControl('default'), discovery: bad}});
    assert.equal(status(scenarios, 's0-c-backend-paths-live-and-dead'), 'FAIL');
  }
});
