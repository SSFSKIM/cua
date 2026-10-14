// tab_bot_detection_report (src/browser-service/botdetect.mjs, the vendor's W1 with VY, KY and XY, readable
// chatgpt-26.928.40906 BS:54514-54559), through the real host and the fake extension: a report names one of the four
// reasons and answers {status: 'reported', hostname} with the open page's hostname (null when it has none). The vendor
// sends the report to its telemetry; cua records it nowhere and sends nothing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost} from './support/service-on-host.mjs';

async function reportTab(t, href) {
  const pages = scriptedPages();
  const cdp = request => (request.method === 'Runtime.evaluate' && request.params.expression.startsWith('({ href: window.location.href')
    ? {result: {type: 'object', value: {href, readyState: 'complete'}}}
    : pages.cdp(request));
  const env = await serviceOnHost(t, {pages: {...pages, cdp}});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  return {...env, run: params => execute(env.service, {browser_id: browserId, tab_id: id, ...params})};
}

test('tab_bot_detection_report is registered', () => {
  assert.equal(typeof COMMAND_HANDLERS.get('tab_bot_detection_report'), 'function');
});

test('a report answers the open page\'s hostname and asks the backend for nothing beyond reading the page', async t => {
  const {run, requests} = await reportTab(t, 'https://shop.example.com/checkout?step=2#pay');
  const before = requests().length;
  for (const reason of ['captcha_failed', 'access_denied', 'challenge_loop', 'unexpected_bot_error']) {
    assert.deepEqual(await run({type: 'tab_bot_detection_report', reason}), {status: 'reported', hostname: 'shop.example.com'});
  }
  for (const method of requests().slice(before)) assert.ok(['attach', 'executeCdp'].includes(method), method);
});

test('a page without a hostname reports null', async t => {
  const {run} = await reportTab(t, 'about:blank');
  assert.deepEqual(await run({type: 'tab_bot_detection_report', reason: 'access_denied'}), {status: 'reported', hostname: null});
});

test('a reason outside the four is refused before the page is read', async t => {
  const {run} = await reportTab(t, 'https://shop.example.com/');
  for (const reason of ['blocked', undefined]) {
    assert.match((await rejection(run({type: 'tab_bot_detection_report', reason}))).message, /^Invalid enum value\. Expected 'captcha_failed' \| 'access_denied' \| 'challenge_loop' \| 'unexpected_bot_error'/);
  }
});
