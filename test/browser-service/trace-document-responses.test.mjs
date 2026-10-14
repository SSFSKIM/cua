// The host trace attributes navigation time to the service's document-response interception (M5's benchmark reads it;
// Decision Log 2026-10-14, the session on the document-response pause): with the trace activated for the session
// (src/chrome/trace.mjs), the real host records each Fetch.requestPaused notification it relays to the service and
// each release the service sends back (Fetch.continueResponse for a page, Fetch.failRequest for a download nobody
// waits for), by tab, under the session's name, without parameter values.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execute, readyBrowser, serviceOnHost, waitFor} from './support/service-on-host.mjs';

const header = (name, value) => ({name, value});

test('the host trace records every paused document response and the service\'s release of it', async t => {
  const env = await serviceOnHost(t);
  const trace = join(env.home, 'trace.jsonl');
  mkdirSync(join(env.home, 'state'), {recursive: true});
  writeFileSync(join(env.home, 'state/host-trace.json'), JSON.stringify({path: trace}));
  const browserId = await readyBrowser(env.service);
  await execute(env.service, {type: 'name_session', browser_id: browserId, name: 'downloads/trace'});
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  await execute(env.service, {type: 'navigate_tab_url', browser_id: browserId, tab_id: id, url: 'https://example.com/'});
  const tabId = Number(id);
  const pause = (requestId, headers) => env.ext.cdpEvent({tabId}, 'Fetch.requestPaused', {
    requestId, frameId: 'F1', resourceType: 'Document', request: {url: `https://example.com/${requestId}?secret=1`, method: 'GET', headers: {}},
    responseStatusCode: 200, responseStatusText: 'OK', responseHeaders: headers,
  });
  pause('page-1', [header('content-type', 'text/html')]);
  pause('file-1', [header('content-type', 'text/plain'), header('content-disposition', 'attachment; filename="a.txt"')]);
  pause('page-2', [header('content-type', 'text/html')]);
  const rows = () => readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const releases = () => rows().filter(r => r.kind === 'request' && r.method === 'executeCdp' && /^Fetch\.(continueResponse|failRequest)$/.test(r.cdp));
  await waitFor(() => releases().length === 3, 'the three releases in the trace');
  const paused = rows().filter(r => r.kind === 'notification' && r.cdp === 'Fetch.requestPaused');
  assert.equal(paused.length, 3, 'each pause relayed to the service is a notification row');
  for (const row of paused) assert.deepEqual(row.target, {tabId});
  assert.deepEqual(releases().map(r => r.cdp).sort(), ['Fetch.continueResponse', 'Fetch.continueResponse', 'Fetch.failRequest']);
  for (const row of releases()) {
    assert.equal(row.ok, true);
    assert.equal(typeof row.ms, 'number', 'the release\'s own time');
    assert.deepEqual(row.target, {tabId});
    assert.ok(row.paramKeys.includes('requestId'));
  }
  assert.ok(rows().some(r => r.kind === 'request' && r.cdp === 'Fetch.enable'), 'the interception\'s setup at attach');
  assert.ok(rows().every(r => r.name === 'downloads/trace' || r.method === 'getInfo' || r.method === 'nameSession'), 'attributed to the case by the session name');
  assert.doesNotMatch(readFileSync(trace, 'utf8'), /secret|example\.com|attachment|page-1|file-1/, 'no parameter values');
});
