import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideElicitation, answerFor, inventoryEntry, declineAll} from '../elicitation.mjs';
import {originAccessRequest, downloadRequest, rawCdpRequest, historyRequest, ALL_SITES_SCOPE_KEY} from '../vendor-shapes.mjs';

const ORIGIN = 'http://127.0.0.1:43123';
const req = params => ({jsonrpc: '2.0', id: 5, method: 'elicitation/create', params});
const decide = params => decideElicitation(req(params), {origin: ORIGIN});

test('accepts only the vendor origin-access request for the probe\'s exact origin, and answers it for the session only', () => {
  for (const persist of ['always', undefined, 'session', ['session', 'always']]) {
    const d = decide(originAccessRequest(ORIGIN, {persist}));
    assert.equal(d.accept, true, `persist ${JSON.stringify(persist)}`);
    assert.equal(d.kind, 'origin-access');
    assert.equal(d.ownOrigin, true);
  }
  // Another display name does not matter: the message is never what decides.
  assert.equal(decide(originAccessRequest(ORIGIN, {browserName: 'Codex'})).accept, true);
  assert.deepEqual(answerFor(decide(originAccessRequest(ORIGIN))), {action: 'accept', content: {}, _meta: {persist: 'session'}});
  assert.deepEqual(answerFor(decide(downloadRequest(ORIGIN))), {action: 'decline'});
});

test('the message is never matched: a request is judged by its structured fields alone', () => {
  // Right message, wrong structured origin: declined.
  const wrongMeta = originAccessRequest('https://mail.example.com', {params: {message: `Allow Browser use to access ${ORIGIN}?`}});
  assert.equal(decide(wrongMeta).accept, false);
  // Wrong message, right structured origin: still accepted (the vendor builds the message from the same origin).
  assert.equal(decide(originAccessRequest(ORIGIN, {params: {message: 'Allow Browser use to access something else?'}})).accept, true);
});

const DECLINED = {
  'a user tab origin': originAccessRequest('https://mail.example.com'),
  'a lookalike host': originAccessRequest('http://127.0.0.1.evil.example:43123'),
  'localhost instead of 127.0.0.1': originAccessRequest('http://localhost:43123'),
  'a different port': originAccessRequest('http://127.0.0.1:43124'),
  'https on the same host and port': originAccessRequest('https://127.0.0.1:43123'),
  'a trailing slash': originAccessRequest(`${ORIGIN}/`),
  'the origin as a prefix': originAccessRequest(`${ORIGIN}0`),
  'two origins in tool_params': originAccessRequest(ORIGIN, {meta: {tool_params: {origin: ORIGIN, origins: [ORIGIN, 'https://mail.example.com']}}}),
  'meta origin disagreeing with tool_params': originAccessRequest(ORIGIN, {meta: {origin: 'https://mail.example.com'}}),
  'an origins array': originAccessRequest(ORIGIN, {meta: {tool_params: {origins: [ORIGIN]}}}),
  'a persistent all-sites grant': originAccessRequest(ORIGIN, {meta: {[ALL_SITES_SCOPE_KEY]: 'all-sites'}}),
  'an unknown persist value': originAccessRequest(ORIGIN, {persist: 'forever'}),
  'url mode': originAccessRequest(ORIGIN, {params: {mode: 'url', url: `${ORIGIN}/approve`}}),
  'no mode': originAccessRequest(ORIGIN, {params: {mode: undefined}}),
  'a schema asking for input': originAccessRequest(ORIGIN, {params: {requestedSchema: {type: 'object', properties: {password: {type: 'string'}}}}}),
  'no schema': originAccessRequest(ORIGIN, {params: {requestedSchema: undefined}}),
  'another connector': originAccessRequest(ORIGIN, {meta: {connector_id: 'computer-use'}}),
  'another approval kind': originAccessRequest(ORIGIN, {meta: {codex_approval_kind: 'exec'}}),
  'raw CDP on the probe origin': rawCdpRequest(ORIGIN),
  'a download from the probe origin': downloadRequest(ORIGIN),
  'browsing history': historyRequest(),
  'an unknown shape naming the probe origin': {mode: 'form', requestedSchema: {type: 'object', properties: {}}, message: `Allow access to ${ORIGIN}?`, _meta: {}},
  'no params at all': undefined,
};

test('declines every other request: lookalikes, other ports, two origins, persistent grants, unknown shapes, other kinds', () => {
  for (const [name, params] of Object.entries(DECLINED)) assert.equal(decide(params).accept, false, name);
  assert.equal(decideElicitation({jsonrpc: '2.0', id: 1, method: 'sampling/createMessage', params: originAccessRequest(ORIGIN)}, {origin: ORIGIN}).accept, false);
  assert.equal(decideElicitation(req(originAccessRequest(ORIGIN)), {origin: undefined}).accept, false, 'no running test page, nothing accepted');
  assert.equal(declineAll(req(originAccessRequest(ORIGIN))).accept, false);
});

test('kinds are recorded from structure, and an unstructured request naming the probe origin is flagged for BLOCKED', () => {
  assert.equal(decide(DECLINED['raw CDP on the probe origin']).kind, 'raw-cdp');
  assert.equal(decide(DECLINED['a download from the probe origin']).kind, 'file-transfer');
  assert.equal(decide(DECLINED['browsing history']).kind, 'history');
  assert.equal(decide(DECLINED['a user tab origin']).kind, 'origin-access');
  assert.equal(decide(DECLINED['a user tab origin']).ownOrigin, false);
  const unknown = decide(DECLINED['an unknown shape naming the probe origin']);
  assert.equal(unknown.kind, 'unknown');
  assert.equal(unknown.unstructuredOwnOrigin, true);
  assert.equal(decide(DECLINED['a lookalike host']).unstructuredOwnOrigin, false);
  // Refused shapes that name the probe origin block the verdict; foreign origins do not.
  for (const name of ['two origins in tool_params', 'meta origin disagreeing with tool_params', 'an origins array', 'a persistent all-sites grant', 'an unknown persist value', 'url mode', 'a schema asking for input'])
    assert.equal(decide(DECLINED[name]).refusedOwnOrigin, true, name);
  for (const name of ['a user tab origin', 'a lookalike host', 'a different port', 'localhost instead of 127.0.0.1', 'raw CDP on the probe origin', 'a download from the probe origin'])
    assert.equal(decide(DECLINED[name]).refusedOwnOrigin, undefined, name);
  assert.equal(decideElicitation({jsonrpc: '2.0', id: 1, method: 'roots/list'}, {origin: ORIGIN}).kind, 'other-request');
});

test('the inventory entry keeps kind and answer, and at most a 120-character message prefix with URLs removed', () => {
  const user = 'https://mail.example.com/inbox?token=abcdefabcdefabcdefabcdefabcdefabcdef';
  const params = originAccessRequest(user, {params: {message: `Allow Browser use to access ${user}? ${'x'.repeat(300)}`}});
  const entry = inventoryEntry(req(params), decide(params));
  assert.equal(entry.kind, 'origin-access');
  assert.equal(entry.answered, 'decline');
  assert.equal(entry.mode, 'form');
  assert.ok(entry.text.length <= 120, entry.text);
  assert.doesNotMatch(JSON.stringify(entry), /mail\.example|token=|https?:/);
  const own = inventoryEntry(req(originAccessRequest(ORIGIN)), decide(originAccessRequest(ORIGIN)));
  assert.equal(own.answered, 'accept (session)');
  assert.equal(own.ownOrigin, true);
  assert.doesNotMatch(JSON.stringify(own), /127\.0\.0\.1|43123/);
});
