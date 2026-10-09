// The serve-less runtime listing behind `cua profiles bind`, against the in-process fake upstream: one handshake, one
// read-only cell, every elicitation declined, finite limits, and teardown whatever happens. The cell's own reduction
// (only extension backends, their family and, for Chrome's, instance id, label and tab count leave the REPL) is
// checked by running its source against a fake `cua` API.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fakeUpstream} from './fixtures/mcp-harness.mjs';
import {listBackendsWith, LIST_CELL, LIVENESS_CELL, MARKER} from '../src/profiles/inventory.mjs';

const replyCell = (upstream, request, payload) => upstream.text(request, `docs...\n${MARKER} ${JSON.stringify(payload)}`);

async function answerHandshake(upstream) {
  const init = await upstream.nextRequest('initialize');
  upstream.reply(init, {protocolVersion: '2025-06-18', capabilities: {}, serverInfo: {name: 'rmcp', version: '1'}});
  await upstream.next(m => m.method === 'notifications/initialized', {label: 'initialized'});
}

test('lists the live extension backends through one js cell and tears the runtime down', async () => {
  const upstream = fakeUpstream();
  const listing = listBackendsWith(upstream);
  await answerHandshake(upstream);
  const call = await upstream.nextCall('js');
  assert.equal(call.params.arguments.code, LIST_CELL);
  assert.ok(call.params.arguments.timeout_ms > 0);
  replyCell(upstream, call, {backends: [{instanceId: 'a', family: 'chrome', profileName: 'P', tabCount: 3}, {instanceId: 'b', family: 'chrome', profileName: null, tabCount: 0}]});
  const result = await listing;
  assert.deepEqual(result.backends, [{instanceId: 'a', family: 'chrome', profileName: 'P', tabCount: 3}, {instanceId: 'b', family: 'chrome', tabCount: 0}]);
  assert.equal(result.teardown.confirmed, true);
  assert.equal(upstream.terminations.length, 1);
  assert.equal(upstream.calls('js').length, 1, 'nothing but the one listing cell');
});

test('every elicitation during the listing is declined and counted', async () => {
  const upstream = fakeUpstream();
  const listing = listBackendsWith(upstream);
  await answerHandshake(upstream);
  const call = await upstream.nextCall('js');
  upstream.emit({jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {mode: 'form', message: 'Allow?', requestedSchema: {type: 'object', properties: {}}}});
  const answer = await upstream.next(m => m.id === 'e1' && m.method === undefined, {label: 'elicitation answer'});
  assert.deepEqual(answer.result, {action: 'decline'});
  replyCell(upstream, call, {backends: []});
  assert.equal((await listing).elicitationsDeclined, 1);
});

test('a cell error, a malformed result or a silent runtime fail classified, value-free, and still tear down', async () => {
  for (const [name, act, code] of [
    ['cell error', (u, c) => replyCell(u, c, {error: 'list_failed'}), 'listing_failed'],
    ['no marker', (u, c) => u.text(c, 'something else'), 'listing_failed'],
    ['bad entries', (u, c) => replyCell(u, c, {backends: [{instanceId: 7, family: 'chrome'}]}), 'listing_failed'],
    ['a Chrome backend without an instance id', (u, c) => replyCell(u, c, {backends: [{family: 'chrome', profileName: 'P'}]}), 'listing_failed'],
    ['isError', (u, c) => u.reply(c, {content: [{type: 'text', text: 'boom'}], isError: true}), 'listing_failed'],
  ]) {
    const upstream = fakeUpstream();
    const listing = listBackendsWith(upstream);
    await answerHandshake(upstream);
    act(upstream, await upstream.nextCall('js'));
    await assert.rejects(listing, error => error.code === code, name);
    assert.equal(upstream.terminations.length, 1, name);
  }
  const silent = fakeUpstream();
  const listing = listBackendsWith(silent, {limits: {initializeMs: 50, callMs: 50}});
  await assert.rejects(listing, error => error.code === 'runtime_unresponsive');
  assert.equal(silent.terminations.length, 1);
});

test('the listing cell reduces the vendor inventory to extension backends, instance ids, labels and tab counts', async () => {
  const writes = [];
  const tabsOf = {1: [{title: 'secret tab', url: 'https://example.com/x'}], 2: [], 3: null};
  const cua = {
    listBrowsers: async ({emit}) => { assert.equal(emit, false); return [
      {id: '1', type: 'extension', family: 'chrome', name: 'Chrome', profileName: 'Personal', metadata: {extensionInstanceId: 'inst-a', codexSessionId: 's'}},
      {id: '2', type: 'extension', family: 'chrome', name: 'Chrome', metadata: {extensionInstanceId: 'inst-b'}},
      {id: '3', type: 'extension', family: 'chrome', name: 'Chrome', metadata: {extensionInstanceId: 'inst-c'}},
      {id: '9', type: 'iab', name: 'In-app'},
    ]; },
    listTabs: async ({browser, emit}) => { assert.equal(emit, false); if (tabsOf[browser] === null) throw new Error('tabs of https://example.com failed'); return tabsOf[browser]; },
  };
  const nodeRepl = {write: text => writes.push(text)};
  await new Function('cua', 'nodeRepl', `return (async () => { ${LIST_CELL} })();`)(cua, nodeRepl);
  assert.equal(writes.length, 1);
  assert.ok(!writes[0].includes('example.com') && !writes[0].includes('secret tab'), 'no tab data leaves the cell');
  const payload = JSON.parse(writes[0].slice(MARKER.length + 1));
  assert.deepEqual(payload, {backends: [
    {instanceId: 'inst-a', family: 'chrome', profileName: 'Personal', tabCount: 1},
    {instanceId: 'inst-b', family: 'chrome', profileName: null, tabCount: 0},
    {instanceId: 'inst-c', family: 'chrome', profileName: null, tabCount: null},
  ]});
});

// Review fix: the registry reads profiles from Google Chrome only, so another browser's backend must never become a
// bind candidate (an Edge backend labelled "Personal" was bound to Chrome's "Personal" profile).
test('the listing cell keeps each backend\'s family and lets only its family leave for another browser\'s or a family-less backend', async () => {
  const writes = [];
  const asked = [];
  const cua = {
    listBrowsers: async () => [
      {id: '1', type: 'extension', family: 'chrome', name: 'Chrome', profileName: 'Personal', metadata: {extensionInstanceId: 'inst-chrome'}},
      {id: '2', type: 'extension', family: 'edge', name: 'Microsoft Edge', profileName: 'Edge Person', metadata: {extensionInstanceId: 'inst-edge'}},
      {id: '3', type: 'extension', name: 'Unknown', profileName: 'No Family Person', metadata: {extensionInstanceId: 'inst-none'}},
      {id: '4', type: 'extension', family: 'Weird Family!', name: 'Odd', metadata: {extensionInstanceId: 'inst-odd'}},
    ],
    listTabs: async ({browser}) => { asked.push(browser); return [{title: 't', url: 'https://example.com/'}]; },
  };
  await new Function('cua', 'nodeRepl', `return (async () => { ${LIST_CELL} })();`)(cua, {write: text => writes.push(text)});
  assert.deepEqual(asked, ['1'], 'only a Chrome backend is asked for its tabs');
  for (const leaked of ['inst-edge', 'Edge Person', 'inst-none', 'No Family Person', 'inst-odd', 'Weird'])
    assert.ok(!writes[0].includes(leaked), `${leaked} must not leave the cell`);
  assert.deepEqual(JSON.parse(writes[0].slice(MARKER.length + 1)), {backends: [
    {instanceId: 'inst-chrome', family: 'chrome', profileName: 'Personal', tabCount: 1},
    {family: 'edge'},
    {family: null},
    {family: 'other'},
  ]});
});

test('a parsed listing keeps the family, and a non-Chrome backend keeps nothing else even if the payload carries it', async () => {
  const upstream = fakeUpstream();
  const listing = listBackendsWith(upstream);
  await answerHandshake(upstream);
  replyCell(upstream, await upstream.nextCall('js'), {backends: [
    {instanceId: 'a', family: 'chrome', profileName: 'P', tabCount: 1},
    {instanceId: 'e', family: 'edge', profileName: 'P', tabCount: 4},
    {instanceId: 'n', profileName: 'P'},
    {family: 'edge'},
  ]});
  assert.deepEqual((await listing).backends, [{instanceId: 'a', family: 'chrome', profileName: 'P', tabCount: 1}, {family: 'edge'}, {}, {family: 'edge'}]);
});

test('a readiness listing (no tab counts) sends a cell that never asks for tabs, and reduces the same way', async () => {
  const upstream = fakeUpstream();
  const listing = listBackendsWith(upstream, {tabCounts: false});
  await answerHandshake(upstream);
  const call = await upstream.nextCall('js');
  assert.equal(call.params.arguments.code, LIVENESS_CELL);
  replyCell(upstream, call, {backends: [{instanceId: 'a', family: 'chrome', profileName: null, tabCount: null}]});
  assert.deepEqual((await listing).backends, [{instanceId: 'a', family: 'chrome'}]);
  assert.equal(upstream.terminations.length, 1);

  const writes = [];
  let tabReads = 0;
  const cua = {
    listBrowsers: async () => [{id: '1', type: 'extension', family: 'chrome', profileName: 'Personal', metadata: {extensionInstanceId: 'inst-a'}}, {id: '9', type: 'iab'}],
    listTabs: async () => { tabReads++; return []; },
  };
  await new Function('cua', 'nodeRepl', `return (async () => { ${LIVENESS_CELL} })();`)(cua, {write: text => writes.push(text)});
  assert.deepEqual(JSON.parse(writes[0].slice(MARKER.length + 1)), {backends: [{instanceId: 'inst-a', family: 'chrome', profileName: 'Personal', tabCount: null}]});
  assert.equal(tabReads, 0, 'a readiness listing never reads tabs');
});

test('the listing cell carries the sandbox state it is given, and none when given none', async () => {
  const state = {permissionProfile: {type: 'disabled'}, sandboxCwd: 'file:///tmp/run/sess'};
  for (const sandboxState of [state, null]) {
    const upstream = fakeUpstream();
    const listing = listBackendsWith(upstream, {tabCounts: false, sandboxState});
    await answerHandshake(upstream);
    const call = await upstream.nextCall('js');
    if (sandboxState) assert.deepEqual(call.params._meta['codex/sandbox-state-meta'], state);
    else assert.equal('codex/sandbox-state-meta' in call.params._meta, false);
    assert.equal(typeof call.params._meta['x-codex-turn-metadata'].session_id, 'string');
    replyCell(upstream, call, {backends: []});
    await listing;
  }
});

test('an unconfirmed runtime teardown fails the listing, classified, and keeps a listing failure\'s diagnostic too', async () => {
  const unconfirmed = {confirmed: false, steps: ['eof', 'sigterm', 'sigkill'], reason: 'a group member survived'};
  const upstream = fakeUpstream();
  upstream.terminateImpl = async () => unconfirmed;
  const listing = listBackendsWith(upstream);
  await answerHandshake(upstream);
  replyCell(upstream, await upstream.nextCall('js'), {backends: [{instanceId: 'a', profileName: 'P', tabCount: 1}]});
  await assert.rejects(listing, error => error.code === 'runtime_teardown_unconfirmed' && /a group member survived/.test(error.message) && error.teardown === unconfirmed);

  const both = fakeUpstream();
  both.terminateImpl = async () => unconfirmed;
  const failing = listBackendsWith(both);
  await answerHandshake(both);
  replyCell(both, await both.nextCall('js'), {error: 'list_failed'});
  await assert.rejects(failing, error => error.code === 'runtime_teardown_unconfirmed' && /a group member survived/.test(error.message) && /listing_failed/.test(error.message));
});

test('the cell recognises a MAWS backend by its instance id prefix and lets nothing of it out; a parsed one is dropped too', async () => {
  const writes = [];
  const cua = {
    listBrowsers: async () => [
      {id: '1', type: 'extension', family: 'chrome', profileName: 'Personal', metadata: {extensionInstanceId: 'inst-a'}},
      {id: '2', type: 'extension', family: 'chrome', profileName: 'MAWS', metadata: {extensionInstanceId: 'maws:app-1'}},
    ],
    listTabs: async () => [],
  };
  for (const cell of [LIST_CELL, LIVENESS_CELL]) {
    writes.length = 0;
    await new Function('cua', 'nodeRepl', `return (async () => { ${cell} })();`)(cua, {write: text => writes.push(text)});
    assert.ok(!writes[0].includes('maws:app-1'));
    assert.deepEqual(JSON.parse(writes[0].slice(MARKER.length + 1)).backends.map(b => b.instanceId), ['inst-a']);
  }
  const upstream = fakeUpstream();
  const listing = listBackendsWith(upstream);
  await answerHandshake(upstream);
  replyCell(upstream, await upstream.nextCall('js'), {backends: [{instanceId: 'maws:app-1', family: 'chrome'}, {instanceId: 'a', family: 'chrome'}]});
  assert.deepEqual((await listing).backends, [{instanceId: 'a', family: 'chrome'}]);
});
