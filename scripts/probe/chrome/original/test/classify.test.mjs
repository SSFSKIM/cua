import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeVendorText, classifyError} from '../classify.mjs';

test('sanitizeVendorText strips URLs, paths, UUIDs, emails and token-like runs', () => {
  const raw = 'Failed https://chatgpt.com/backend-api/aura/identity?x=1 at /Users/u/Library/x.sock for ' +
    '0a1b2c3d-0000-4000-8000-00000000abcd by me@example.com token eyJhbGciOiJIUzI1NiJ9abcdefghijklmnop';
  const s = sanitizeVendorText(raw);
  assert.equal(s, 'Failed <url> at <path> for <uuid> by <email> token <token>');
});

test('sanitizeVendorText keeps ordinary vendor sentences and caps length', () => {
  assert.equal(sanitizeVendorText('Browser request-header policy requires caller identity.'), 'Browser request-header policy requires caller identity.');
  assert.equal(sanitizeVendorText('x'.repeat(10) + ' ' + 'word '.repeat(200)).length <= 300, true);
});

test('classifyError orders identity/auth before policy', () => {
  assert.equal(classifyError('Browser request-header policy requires caller identity.'), 'identity-or-auth');
  assert.equal(classifyError('Codex auth token is unavailable'), 'identity-or-auth');
  assert.equal(classifyError('User unavailable'), 'identity-or-auth');
});

test('classifyError recognises policy and transport classes', () => {
  assert.equal(classifyError('This browser requires agent request headers. Update the Chrome extension before continuing.'), 'policy');
  assert.equal(classifyError('Blocked by security policy'), 'policy');
  assert.equal(classifyError('Timed out after 5000ms waiting for browser backend info.'), 'transport');
  assert.equal(classifyError('native pipe initial connect timed out'), 'transport');
  assert.equal(classifyError('something odd'), 'other');
});

test('sanitizeVendorText removes bare host names but keeps config file names', () => {
  assert.equal(sanitizeVendorText('Allow Browser use to access mail.example.co.uk? See config.toml and auth.json'), 'Allow Browser use to access <host>? See config.toml and auth.json');
});

test('reportLeaks finds forbidden values, URLs, absolute paths and token-like runs, and passes clean metadata', async () => {
  const {reportLeaks} = await import('../classify.mjs');
  assert.deepEqual(reportLeaks(JSON.stringify({sha256: 'a'.repeat(64), text: '<url> refused', count: 3, probe: 'scripts/probe-chrome-original.mjs'}), []), []);
  assert.ok(reportLeaks('{"x":"see http://127.0.0.1:5555/"}', []).some(f => /URL/.test(f)));
  assert.ok(reportLeaks('{"x":"/Users/someone/Library/x"}', []).some(f => /path/.test(f)));
  assert.ok(reportLeaks('{"x":"/tmp/codex-browser-use/a.sock"}', []).some(f => /path/.test(f)));
  assert.ok(reportLeaks('{"x":"tok sk0123456789abcdefghijklmnopqrstuvwxyzABCD"}', []).some(f => /token/.test(f)));
  assert.ok(reportLeaks('{"x":"SECRET-TITLE"}', ['SECRET-TITLE']).some(f => /forbidden/.test(f)));
  assert.equal(reportLeaks('{"x":"SECRET"}', ['SECRET'])[0].includes('SECRET'), false, 'findings never repeat the value');
});
