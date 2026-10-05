// Token-bearing URL redaction in js/js_reset results (issue #24): what is redacted, what is left alone, and that the
// rewrite applies to results only, never to the request the agent sent.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redactTokens} from '../src/mcp/surface.mjs';
import {harness, initialized} from './fixtures/mcp-harness.mjs';

// Fixture values only; none is a real credential.
const FAKE = 'FAKEtok_9a8b7c6d5e4f';
const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const RELAY = `ws://127.0.0.1:53111/extension/${FAKE}`;
const CONNECT = `chrome-extension://${EXT}/connect.html?mcpRelayUrl=${encodeURIComponent(RELAY)}&client=%7B%22name%22%3A%22x%22%7D&protocolVersion=2&token=${FAKE}&newTab=true`;
const text = s => ({content: [{type: 'text', text: s}], isError: false});
const textOf = result => result.content[0].text;

test('query parameters named like a token, key or secret have their value redacted, other parameters stay', () => {
  const cases = [
    [`https://a.example/cb?token=${FAKE}&page=2`, 'https://a.example/cb?token=<redacted>&page=2'],
    [`https://a.example/?q=cats&access_token=${FAKE}`, 'https://a.example/?q=cats&access_token=<redacted>'],
    [`https://a.example/v1?api_key=${FAKE}#top`, 'https://a.example/v1?api_key=<redacted>#top'],
    [`https://a.example/v1?apiKey=${FAKE}&key=${FAKE}`, 'https://a.example/v1?apiKey=<redacted>&key=<redacted>'],
    [`https://a.example/v1?client_secret=${FAKE}&secret=${FAKE}`, 'https://a.example/v1?client_secret=<redacted>&secret=<redacted>'],
    [`https://a.example/v1?X-Refresh-Token=${FAKE}`, 'https://a.example/v1?X-Refresh-Token=<redacted>'],
    [`https://a.example/cb#access_token=${FAKE}&state=s1`, 'https://a.example/cb#access_token=<redacted>&state=s1'],
    [`go to https://a.example/x?token=${FAKE}, then back`, 'go to https://a.example/x?token=<redacted>, then back'],
    [`[link](https://a.example/x?token=${FAKE})`, '[link](https://a.example/x?token=<redacted>)'],
    [`"url":"https://a.example/x?token=${FAKE}"`, '"url":"https://a.example/x?token=<redacted>"'],
    // URL-encoded inside another URL's parameter.
    [`https://a.example/login?next=%2Fcb%3Ftoken%3D${FAKE}%26x%3D1`, 'https://a.example/login?next=%2Fcb%3Ftoken%3D<redacted>%26x%3D1'],
  ];
  for (const [input, expected] of cases) assert.equal(textOf(redactTokens(text(input))), expected, input);
});

test('names that merely contain the words, and plain text, are left alone', () => {
  for (const input of [
    'https://a.example/shop?monkey=1&hotkeys=2&tokens_left=3&keyword=cats',
    'the token is shown on screen; key=value pairs in prose are not URLs? no',
    'https://a.example/?token=', // an empty value is left as is
  ]) assert.equal(textOf(redactTokens(text(input))), input);
});

test('the Playwright MCP extension connection URL has every parameter value redacted, and a bare relay URL its path', () => {
  const out = textOf(redactTokens(text(`tab 3: Playwright MCP extension ${CONNECT} (active)`)));
  assert.equal(out, `tab 3: Playwright MCP extension chrome-extension://${EXT}/connect.html?mcpRelayUrl=<redacted>&client=<redacted>&protocolVersion=<redacted>&token=<redacted>&newTab=<redacted> (active)`);
  assert.ok(!out.includes(FAKE));
  assert.equal(textOf(redactTokens(text(`relay ${RELAY} up`))), 'relay ws://127.0.0.1:53111/extension/<redacted> up');
  assert.equal(textOf(redactTokens(text(`relay ws://[::1]:9/extension/${FAKE}`))), 'relay ws://[::1]:9/extension/<redacted>');
});

test('structured content is rewritten at every depth; images, _meta and non-string values are untouched', () => {
  const result = {
    content: [{type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo'}, {type: 'text', text: `see ${CONNECT}`}],
    structuredContent: {apps: ['Google Chrome'], tabs: [{id: 3, title: 'Connect', url: CONNECT, active: true}, {id: 4, url: `https://a.example/?token=${FAKE}`, pinned: null}]},
    _meta: {'cua/taskId': 't1', note: `?token=${FAKE}`},
    isError: false,
  };
  const out = redactTokens(result);
  assert.deepEqual(out.content[0], result.content[0]);
  assert.ok(!out.content[1].text.includes(FAKE));
  assert.ok(!JSON.stringify(out.structuredContent).includes(FAKE));
  assert.deepEqual(out.structuredContent.apps, ['Google Chrome']);
  assert.deepEqual({...out.structuredContent.tabs[0], url: undefined}, {id: 3, title: 'Connect', url: undefined, active: true});
  assert.equal(out.structuredContent.tabs[1].url, 'https://a.example/?token=<redacted>');
  assert.equal(out.structuredContent.tabs[1].pinned, null);
  assert.deepEqual(out._meta, result._meta, 'only content and structured content are rewritten');
  assert.equal(out.isError, false);
  assert.ok(result.content[1].text.includes(FAKE), 'the input is not mutated');
});

test('a result with nothing to redact comes back equal', () => {
  const result = {content: [{type: 'text', text: 'apps: Finder, Notes\nhttps://a.example/?q=1'}], structuredContent: {n: 1}, isError: false};
  assert.deepEqual(redactTokens(result), result);
  assert.deepEqual(redactTokens({}), {});
});

test('cua serve redacts js and js_reset results and forwards the request unchanged', async () => {
  const h = harness();
  await initialized(h);
  const code = `return "https://a.example/?token=${FAKE}"`;
  const call = h.client.call('js', {code});
  const up = await h.upstream.nextCall('js');
  assert.equal(up.params.arguments.code, code, 'the request is untouched');
  h.upstream.reply(up, {content: [{type: 'text', text: `inventory: ${CONNECT}`}], structuredContent: {url: CONNECT}, isError: false});
  const {result} = await call.response;
  assert.ok(!JSON.stringify(result).includes(FAKE));
  assert.match(result.content[0].text, /^inventory: chrome-extension:\/\/[a-p]{32}\/connect\.html\?mcpRelayUrl=<redacted>/);
  assert.equal(result._meta['cua/taskId'], up.params._meta['x-codex-turn-metadata'].turn_id);

  const reset = h.client.call('js_reset');
  h.upstream.reply(await h.upstream.nextCall('js_reset'), text(`reset; last page https://a.example/?access_token=${FAKE}`));
  assert.equal((await reset.response).result.content[0].text, 'reset; last page https://a.example/?access_token=<redacted>');
});
