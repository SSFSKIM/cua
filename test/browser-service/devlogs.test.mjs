// tab_dev_logs (src/browser-service/devlogs.mjs, the vendor's Of and U1, readable chatgpt-26.928.40906 BS:60710-60880 and
// BS:54448-54469), through the real host and the fake extension: the Runtime domain is enabled when a tab is attached,
// the page's console calls and uncaught exceptions are kept per tab (the newest 500), and a logs call answers the last
// `limit` entries matching its filter and levels; a detached tab's log is forgotten.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {execute, readyBrowser, serviceOnHost, waitFor} from './support/service-on-host.mjs';

const consoleCall = (type, args, url) => ({type, args, executionContextId: 1, timestamp: 1, ...(url ? {stackTrace: {callFrames: [{url, functionName: '', lineNumber: 0, columnNumber: 0, scriptId: '1'}]}} : {})});

async function tabOn(t) {
  const env = await serviceOnHost(t);
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
  const emit = (method, params) => env.ext.cdpEvent({tabId: Number(id)}, method, params);
  const enables = () => env.pages.sent.filter(s => s.method === 'Runtime.enable' && s.tabId === Number(id)).length;
  return {...env, browserId, run, emit, enables, tabId: id};
}

test('tab_dev_logs is registered', () => {
  assert.equal(typeof COMMAND_HANDLERS.get('tab_dev_logs'), 'function');
});

test('a logs call attaches the tab and enables Runtime once; console calls and exceptions are kept in order', async t => {
  const {run, emit, enables} = await tabOn(t);
  assert.deepEqual(await run({type: 'tab_dev_logs'}), {logs: []});
  assert.equal(enables(), 1, 'Runtime enabled at the attachment, not again for the call');
  emit('Runtime.consoleAPICalled', consoleCall('log', [{type: 'string', value: 'parity-log'}, {type: 'number', value: 3}, {type: 'object', description: 'Object'}, {type: 'object'}], 'https://example.com/app.js'));
  emit('Runtime.consoleAPICalled', consoleCall('warning', [{type: 'string', value: 'careful'}]));
  emit('Runtime.consoleAPICalled', consoleCall('table', []));
  emit('Runtime.exceptionThrown', {timestamp: 1, exceptionDetails: {exceptionId: 1, text: 'Uncaught', lineNumber: 0, columnNumber: 0, url: 'https://example.com/boom.js', exception: {type: 'object', description: 'Error: boom'}}});
  emit('Runtime.exceptionThrown', {timestamp: 1, exceptionDetails: {exceptionId: 2, text: 'Uncaught', lineNumber: 0, columnNumber: 0, exception: {type: 'string', value: 'thrown text'}}});
  emit('Runtime.exceptionThrown', {timestamp: 1, exceptionDetails: {exceptionId: 3, text: 'Uncaught (in promise)', lineNumber: 0, columnNumber: 0}});
  await waitFor(async () => (await run({type: 'tab_dev_logs'})).logs.length === 6, 'six entries');
  const {logs} = await run({type: 'tab_dev_logs'});
  for (const entry of logs) assert.ok(!Number.isNaN(Date.parse(entry.timestamp)), 'an ISO timestamp');
  assert.deepEqual(logs.map(({timestamp, ...rest}) => rest), [
    {level: 'log', message: 'parity-log 3 Object [object]', url: 'https://example.com/app.js'},
    {level: 'warn', message: 'careful'},
    {level: 'log', message: ''},
    {level: 'error', message: 'Error: boom', url: 'https://example.com/boom.js'},
    {level: 'error', message: 'thrown text'},
    {level: 'error', message: 'Uncaught (in promise)'},
  ]);
  assert.equal(enables(), 1);
});

test('filter, levels and limit select the newest matching entries; 500 are kept per tab', async t => {
  const {run, emit} = await tabOn(t);
  await run({type: 'tab_dev_logs'});
  for (let i = 0; i < 510; i++) emit('Runtime.consoleAPICalled', consoleCall(i % 2 ? 'error' : 'info', [{type: 'string', value: `entry ${i}`}]));
  await waitFor(async () => (await run({type: 'tab_dev_logs', limit: 1000})).logs.at(-1)?.message === 'entry 509', 'every entry');
  const all = (await run({type: 'tab_dev_logs', limit: 1000})).logs;
  assert.equal(all.length, 500, 'the oldest dropped');
  assert.equal(all[0].message, 'entry 10');
  assert.equal((await run({type: 'tab_dev_logs'})).logs.length, 100, 'a hundred by default');
  assert.deepEqual((await run({type: 'tab_dev_logs', filter: 'entry 50', levels: ['error'], limit: 2})).logs.map(l => l.message), ['entry 507', 'entry 509']);
  assert.deepEqual((await run({type: 'tab_dev_logs', levels: ['debug']})).logs, []);
});

test('a detached tab\'s log is forgotten and Runtime is enabled again at the next attachment', async t => {
  const env = await tabOn(t);
  const {run, emit, enables} = env;
  await run({type: 'tab_dev_logs'});
  emit('Runtime.consoleAPICalled', consoleCall('log', [{type: 'string', value: 'before'}]));
  await waitFor(async () => (await run({type: 'tab_dev_logs'})).logs.length === 1, 'the entry');
  await run({type: 'mark_tab', status: 'deliverable'});
  await env.turnEnded();                       // the turn's end detaches the service's tabs
  env.setTurn({session_id: 'session-a', turn_id: 'turn-2'});
  assert.deepEqual(await run({type: 'tab_dev_logs'}), {logs: []});
  assert.equal(enables(), 2);
});
