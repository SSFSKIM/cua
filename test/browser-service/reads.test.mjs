// The locator reads (src/browser-service/reads.mjs): the vendor's result shapes ({count}, {value}, {values}), the
// single-element reads polling until their budget with the vendor's strictness, the list and state reads answering
// at once, and values of credential-named fields withheld. Over the real controller and selector engine against the
// fake Chrome of support/page-world.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {InjectedScripts} from '../../src/browser-service/injected.mjs';
import {READ_HANDLERS} from '../../src/browser-service/reads.mjs';
import {SelectorEngine} from '../../src/browser-service/selectors.mjs';
import {FAKE_INJECTED_SOURCE, el, pageWorld} from './support/page-world.mjs';

const TAB = 3;
const MAIN = `MAIN-${TAB}`;

function setup(elements) {
  const {api, browser} = pageWorld();
  browser.tab(TAB, {elements});
  const cdp = new CdpController(api);
  const injected = new InjectedScripts(cdp, {source: FAKE_INJECTED_SOURCE});
  const session = {cdp, injected, selectors: new SelectorEngine(cdp, injected)};
  const read = (type, params) => READ_HANDLERS[type]({browser_id: 'b', tab_id: String(TAB), ...params}, session);
  return {browser, read};
}

const page = () => [
  el('p', {cls: 'item', text: 'Alpha', attrs: {'data-note': 'stable'}}),
  el('p', {cls: 'item', text: 'Beta', visible: false, children: [el('b', {cls: 'inner', text: 'B'})]}),
  el('button', {id: 'enabled', text: 'Enabled'}),
  el('button', {id: 'disabled', text: 'Disabled', disabled: true}),
  el('input', {id: 'password', attrs: {name: 'password', value: 'hunter2'}}),
  el('input', {id: 'plain', attrs: {name: 'city', value: 'Seoul'}}),
];

test('count, text, inner text, attribute and the list reads answer in the vendor\'s shapes', async () => {
  const {browser, read} = setup(page());
  assert.deepEqual(await read('playwright_locator_count', {selector: '.item'}), {count: 2});
  assert.deepEqual(await read('playwright_locator_count', {selector: '.none'}), {count: 0});
  assert.deepEqual(await read('playwright_locator_text_content', {selector: '#enabled'}), {value: 'Enabled'});
  assert.deepEqual(await read('playwright_locator_inner_text', {selector: '#enabled'}), {value: 'Enabled'});
  assert.deepEqual(await read('playwright_locator_get_attribute', {selector: '.item >> nth=0', name: 'data-note'}), {value: 'stable'});
  assert.deepEqual(await read('playwright_locator_get_attribute', {selector: '.item >> nth=0', name: 'missing'}), {value: null});
  assert.deepEqual(await read('playwright_locator_all_text_contents', {selector: '.item'}), {values: ['Alpha', 'BetaB']});
  assert.deepEqual(await read('playwright_locator_read_all', {selector: '.item'}), {values: [
    {attributes: {'data-note': 'stable'}, inner_text: 'Alpha', text_content: 'Alpha'},
    {attributes: {}, inner_text: '', text_content: 'BetaB'},
  ]});
  assert.deepEqual(await read('playwright_locator_read_all', {selector: '.item', relative_selector: '.inner'}),
    {values: [null, {attributes: {}, inner_text: 'B', text_content: 'B'}]});
  assert.equal(browser.objects.size, 0);
});

test('the states read the first match and are false for a missing element, without waiting', async () => {
  const {read} = setup(page());
  assert.deepEqual(await read('playwright_locator_is_visible', {selector: '#enabled'}), {value: true});
  assert.deepEqual(await read('playwright_locator_is_visible', {selector: '.item >> nth=1'}), {value: false});
  assert.deepEqual(await read('playwright_locator_is_enabled', {selector: '#disabled'}), {value: false});
  const started = Date.now();
  assert.deepEqual(await read('playwright_locator_is_visible', {selector: '#absent'}), {value: false});
  assert.ok(Date.now() - started < 500, 'not polled');
});

test('a credential-named field\'s value is withheld; another field\'s is read', async () => {
  const {read} = setup(page());
  assert.deepEqual(await read('playwright_locator_get_attribute', {selector: '#password', name: 'value'}), {value: null});
  assert.deepEqual(await read('playwright_locator_get_attribute', {selector: '#password', name: 'name'}), {value: 'password'});
  assert.deepEqual(await read('playwright_locator_get_attribute', {selector: '#plain', name: 'value'}), {value: 'Seoul'});
  const {values} = await read('playwright_locator_read_all', {selector: 'input'});
  assert.deepEqual(values.map(v => v.attributes.value), [undefined, 'Seoul']);
});

test('a single-element read polls for its element within timeout_ms and fails with the vendor\'s sentence after it', async () => {
  const {browser, read} = setup([]);
  setTimeout(() => browser.navigate(MAIN, {elements: [el('p', {id: 'late', text: 'Late'})]}), 300);
  assert.deepEqual(await read('playwright_locator_text_content', {selector: '#late', timeout_ms: 3000}), {value: 'Late'});
  const error = await read('playwright_locator_text_content', {selector: '#never', timeout_ms: 250}).catch(e => e);
  assert.equal(error.code, 'timeout');
  assert.match(error.message, /^(Timed out after 250ms waiting for selector #never|Playwright selector deadline exceeded)/);
});

test('a single-element read of several visible matches is a strict-mode violation; get_attribute requires a name', async () => {
  const {read} = setup([el('i', {cls: 'dup'}), el('i', {cls: 'dup'})]);
  const error = await read('playwright_locator_text_content', {selector: '.dup'}).catch(e => e);
  assert.equal(error.code, 'strict_mode_violation');
  await assert.rejects(read('playwright_locator_get_attribute', {selector: '.dup'}), /^Error: playwright_locator_get_attribute requires name$/);
});
