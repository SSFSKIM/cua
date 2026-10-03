// The Chrome acceptance harness's own parts that need no browser: the page computes the digest the harness expects,
// serves only itself on its exact Host, and the fixed cells parse the wrapper's classification and never name a value.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {request} from 'node:http';
import {startAcceptancePage, SCRIPT, CSP, expectedDigest, INPUT_LABEL} from '../scripts/accept/chrome-page.mjs';
import {inducedFailure, fillReference, CLOSE_TAB} from '../scripts/accept/chrome-cells.mjs';
import {inputFailed} from '../src/services/secret-input.mjs';

test('the page script shows the first 16 hex digits of SHA-256 of the field, never the field', async () => {
  const value = 'cua-m11-Sentinel-ÄÖ-+/=';
  const elements = {secret: {value}, out: {textContent: 'waiting'}, compute: {addEventListener: (type, fn) => { elements.compute.click = fn; }}};
  const context = vm.createContext({document: {getElementById: id => elements[id]}, TextEncoder, crypto: globalThis.crypto, Uint8Array, Array});
  vm.runInContext(SCRIPT, context);
  await elements.compute.click();
  assert.equal(elements.out.textContent, `done: ${expectedDigest(value)}`);
  assert.ok(!elements.out.textContent.includes(value));
});

const get = (url, host) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const req = request({host: u.hostname, port: u.port, path: u.pathname, headers: host ? {host} : {}}, res => {
    let body = '';
    res.on('data', d => { body += d; });
    res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}));
  });
  req.on('error', reject);
  req.end();
});

test('the page is one self-contained document on its exact loopback Host, with a masked password field', async t => {
  const page = await startAcceptancePage();
  t.after(page.close);
  assert.match(page.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const ok = await get(page.url);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['content-security-policy'], CSP);
  assert.ok(ok.body.includes(page.documentMarker));
  assert.match(ok.body, new RegExp(`<input id="secret" type="password" aria-label="${INPUT_LABEL}"`));
  assert.equal((await get(page.url, `localhost:${new URL(page.url).port}`)).status, 421);
  assert.equal((await get(`${page.origin}/other`)).status, 404);
  assert.deepEqual(page.requests(), {total: 3, served: 1, refused: 2});
});

test('the induced-failure cell extracts the wrapper\'s code and classification from its fixed message', async () => {
  const page = {documentMarker: 'doc-marker', url: 'http://127.0.0.1:1/'};
  const writes = [];
  const message = `locator.fill failed for selector #cua-accept-absent\nCaused by: ${inputFailed('fill', 'label-1', 'failed').message}\nLocator diagnostics: {}`;
  const locator = selector => ({
    textContent: async () => selector === '#marker' ? 'doc-marker' : '',
    fill: async () => { throw new Error(message); },
  });
  globalThis.__acc = {verified: true, tab: {playwright: {locator}}};
  try {
    await new Function('nodeRepl', `return (async () => { ${inducedFailure(page, '{{secret:label-1}}')} })();`)({write: text => writes.push(text)});
  } finally { delete globalThis.__acc; }
  const out = JSON.parse(writes[0].replace(/^PROBERESULT /, ''));
  assert.deepEqual(out, {code: 'secret_input_failed', classification: 'failed'});
});

test('the fixed cells carry the reference, never anything else secret, and close only the tab they created', () => {
  const page = {documentMarker: 'doc-marker', url: 'http://127.0.0.1:1/'};
  const cell = fillReference(page, '{{secret:cua-label}}');
  assert.ok(cell.includes('"{{secret:cua-label}}"'));
  assert.doesNotMatch(cell, /getAXState/, 'ownership is never checked through an AX snapshot');
  assert.match(CLOSE_TAB, /String\(m\.tab\.id\) !== m\.tabId/);
});
