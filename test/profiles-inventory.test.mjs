// The serve-less runtime listing behind `cua profiles bind`, against the in-process fake upstream: one handshake, one
// read-only cell, every elicitation declined, finite limits, and teardown whatever happens. The cell's own reduction
// (only extension backends, instance id, label and tab count leave the REPL) is checked by running its source against
// a fake `cua` API.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fakeUpstream} from './fixtures/mcp-harness.mjs';
import {listBackendsWith, LIST_CELL, MARKER} from '../src/profiles/inventory.mjs';

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
  replyCell(upstream, call, {backends: [{instanceId: 'a', profileName: 'P', tabCount: 3}, {instanceId: 'b', profileName: null, tabCount: 0}]});
  const result = await listing;
  assert.deepEqual(result.backends, [{instanceId: 'a', profileName: 'P', tabCount: 3}, {instanceId: 'b', tabCount: 0}]);
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
    ['bad entries', (u, c) => replyCell(u, c, {backends: [{instanceId: 7}]}), 'listing_failed'],
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
      {id: '1', type: 'extension', name: 'Chrome', profileName: 'Personal', metadata: {extensionInstanceId: 'inst-a', codexSessionId: 's'}},
      {id: '2', type: 'extension', name: 'Chrome', metadata: {extensionInstanceId: 'inst-b'}},
      {id: '3', type: 'extension', name: 'Chrome', metadata: {extensionInstanceId: 'inst-c'}},
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
    {instanceId: 'inst-a', profileName: 'Personal', tabCount: 1},
    {instanceId: 'inst-b', profileName: null, tabCount: 0},
    {instanceId: 'inst-c', profileName: null, tabCount: null},
  ]});
});
