// browser_user_history (src/browser-service/history.mjs, the vendor's GS and TW, readable chatgpt-26.928.40906
// BS:27559-27610): the query checked as the vendor checks it, then forwarded to the backend's getUserHistory. cua's
// host serves no history (its extension has no `history` permission until #83), so on its route the command fails in
// the host's words, as the vendor's does there; a backend that answers gets the vendor's item shape.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {HISTORY_HANDLERS} from '../../src/browser-service/history.mjs';
import {execute, readyBrowser, rejection, serviceOnHost} from './support/service-on-host.mjs';

test('browser_user_history is registered', () => {
  assert.equal(typeof COMMAND_HANDLERS.get('browser_user_history'), 'function');
});

test('on cua\'s host the request reaches the host, which refuses it in its own words (the vendor\'s result there)', async t => {
  const env = await serviceOnHost(t);
  const browserId = await readyBrowser(env.service);
  const error = await rejection(execute(env.service, {type: 'browser_user_history', browser_id: browserId,
    queries: ['cua-parity-nonexistent-history-sentinel'], from: '2100-01-01', to: '2100-01-02', limit: 1}));
  assert.equal(error.message, 'No handler registered for method: getUserHistory');
  assert.equal(env.requests().filter(m => m === 'getUserHistory').length, 1);
});

// A session over a backend that answers getUserHistory with `items`, recording each query.
function answering(items) {
  const queries = [];
  const session = {api: {async getUserHistory(query) { queries.push(query); return items; }}};
  return {queries, run: params => HISTORY_HANDLERS.browser_user_history({browser_id: 'b', ...params}, session)};
}

test('a backend\'s items come back as {url, title?, dateVisited}, a null title left out and nothing else passed through', async () => {
  const {queries, run} = answering([
    {url: 'https://a.example/', title: 'A', dateVisited: '2026-10-01T00:00:00Z', visitCount: 3},
    {url: 'https://b.example/', title: null, dateVisited: '2026-10-02T00:00:00Z'},
  ]);
  assert.deepEqual(await run({queries: ['a', 'b'], limit: 5, from: '2026-10-01', to: '2026-10-03'}), {items: [
    {url: 'https://a.example/', title: 'A', dateVisited: '2026-10-01T00:00:00Z'},
    {url: 'https://b.example/', dateVisited: '2026-10-02T00:00:00Z'},
  ]});
  assert.deepEqual(await run({}), {items: [
    {url: 'https://a.example/', title: 'A', dateVisited: '2026-10-01T00:00:00Z'},
    {url: 'https://b.example/', dateVisited: '2026-10-02T00:00:00Z'},
  ]});
  assert.deepEqual(queries, [{queries: ['a', 'b'], limit: 5, from: '2026-10-01', to: '2026-10-03'}, {}], 'only the fields given, browser_id never');
});

test('a malformed query is refused in the vendor\'s sentences before the backend is asked', async () => {
  const {queries, run} = answering([]);
  const refusals = [
    [{queries: []}, 'browser_user_history requires queries to be a non-empty array of strings'],
    [{queries: 'a'}, 'browser_user_history requires queries to be a non-empty array of strings'],
    [{queries: ['a', 2]}, 'browser_user_history requires queries to be a non-empty array of strings'],
    [{limit: 0}, 'browser_user_history requires limit to be a positive integer'],
    [{limit: 1.5}, 'browser_user_history requires limit to be a positive integer'],
    [{from: 'not a date'}, 'browser_user_history requires from to be a valid date'],
    [{to: 20261001}, 'browser_user_history requires to to be a valid date'],
  ];
  for (const [params, sentence] of refusals) assert.equal((await rejection(run(params))).message, sentence, JSON.stringify(params));
  assert.deepEqual(queries, []);
});
