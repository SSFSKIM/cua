import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {startTestPage, doneText, PAGE_TITLE, INPUT_LABEL, BUTTON_LABEL} from '../test-page.mjs';

function get(url, {host} = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = request({hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', headers: host ? {host} : {}}, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves one self-contained page on 127.0.0.1 with a unique marker, one input and one button', async t => {
  const page = await startTestPage();
  t.after(() => page.close());
  assert.match(page.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(page.url, `${page.origin}/`);
  const other = await startTestPage();
  t.after(() => other.close());
  assert.notEqual(page.documentMarker, other.documentMarker);
  assert.notEqual(page.typedMarker, other.typedMarker);

  const res = await get(page.url);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^text\/html/);
  assert.equal(res.headers['set-cookie'], undefined);
  assert.match(res.headers['cache-control'], /no-store/);
  const csp = res.headers['content-security-policy'];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.ok(res.body.includes(`<title>${PAGE_TITLE}</title>`));
  assert.ok(res.body.includes(page.documentMarker));
  assert.equal((res.body.match(/<input\b/g) ?? []).length, 1);
  assert.equal((res.body.match(/<button\b/g) ?? []).length, 1);
  assert.equal((res.body.match(/<form\b/g) ?? []).length, 0, 'nothing submits anywhere');
  assert.ok(res.body.includes(`aria-label="${INPUT_LABEL}"`));
  assert.ok(res.body.includes(`>${BUTTON_LABEL}</button>`));
  // No external resources: no other URL than none at all appears in the document.
  assert.doesNotMatch(res.body, /https?:\/\/|\bsrc=|\bhref=|@import|url\(/);
  // The button only changes this page's DOM, to the text the probe verifies.
  assert.ok(res.body.includes("'done: ' + "));
  assert.equal(doneText('abc'), 'done: abc');
});

test('anything but GET / on the exact host is refused, and requests are counted without paths', async t => {
  const page = await startTestPage();
  t.after(() => page.close());
  assert.equal((await get(`${page.origin}/favicon.ico`)).status, 404);
  assert.equal((await get(page.url, {host: `localhost:${new URL(page.origin).port}`})).status, 421);
  assert.equal((await get(page.url, {host: 'evil.example'})).status, 421);
  assert.equal((await get(page.url)).status, 200);
  assert.deepEqual(page.requests(), {total: 4, served: 1, refused: 3});
});

test('close stops the server', async () => {
  const page = await startTestPage();
  await page.close();
  await assert.rejects(get(page.url));
});
