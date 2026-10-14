// The browser capability commands the backend serves (src/browser-service/viewport.mjs, the vendor's dispatch of a
// command without a handler to executeUnhandledCommand, readable chatgpt-26.928.40906 BS:66434-66443), through the
// real host and the fake extension: the viewport is applied by cua's host; visibility and management are forwarded
// the same way and refused by cua's host in its own words, as the vendor's forwarding would be.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {execute, readyBrowser, rejection, serviceOnHost, waitFor} from './support/service-on-host.mjs';

const TYPES = ['browser_viewport_set', 'browser_viewport_reset', 'browser_visibility_get', 'browser_visibility_set',
  'browser_management_call', 'browser_management_get_audit_trail'];

test('every browser capability command is registered', () => {
  for (const type of TYPES) assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
});

test('browser_viewport_set and _reset reach the host, which applies them to the attached tab', async t => {
  const env = await serviceOnHost(t);
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  await execute(env.service, {type: 'navigate_tab_url', browser_id: browserId, tab_id: id, url: 'https://example.com/'});
  const emulation = () => env.pages.sent.filter(s => s.method.startsWith('Emulation.') && s.method !== 'Emulation.setFocusEmulationEnabled');
  assert.deepEqual(await execute(env.service, {type: 'browser_viewport_set', browser_id: browserId, width: 640, height: 480}), {});
  await waitFor(() => emulation().length === 1, 'the override');
  assert.deepEqual(emulation()[0], {tabId: Number(id), method: 'Emulation.setDeviceMetricsOverride', params: {width: 640, height: 480, deviceScaleFactor: 1, mobile: false}});
  assert.deepEqual(await execute(env.service, {type: 'browser_viewport_reset', browser_id: browserId}), {});
  await waitFor(() => emulation().length === 2, 'the reset');
  assert.equal(emulation()[1].method, 'Emulation.clearDeviceMetricsOverride');
  assert.equal(env.requests().filter(m => m === 'executeUnhandledCommand').length, 2);
  const refused = await rejection(execute(env.service, {type: 'browser_viewport_set', browser_id: browserId, width: 0, height: 480}));
  assert.match(refused.message, /browser_viewport_set requires positive integer width and height/, 'the host\'s own check');
});

test('visibility and management are forwarded as they came and refused by cua\'s host, which announces neither', async t => {
  const env = await serviceOnHost(t);
  const browserId = await readyBrowser(env.service);
  for (const [type, payload] of [['browser_visibility_get', {}], ['browser_visibility_set', {visible: true}],
    ['browser_management_call', {namespace: 'tabs', method: 'query', args: [{}]}], ['browser_management_get_audit_trail', {}]]) {
    const error = await rejection(execute(env.service, {type, browser_id: browserId, ...payload}));
    assert.match(error.message, new RegExp(`cua does not support command "${type}"\\.`), type);
  }
  assert.equal(env.requests().filter(m => m === 'executeUnhandledCommand').length, 4);
});
