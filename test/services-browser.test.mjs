// The trusted browser wrapper with test doubles for the vendor @oai/browser-desktop service and the broker client.
// Request shapes are the pinned 0.1.1 ones: the vendor client sends nodeRepl.rpc("browser", {method, params}) with
// method "execute" or "executeWithRecovery" and params the flat agent command {type, ...payload}
// (browser-client.mjs AC; browser-service.mjs X2/rYe). What the vendor double receives is what the browser would get;
// what the wrapper returns or throws is what reaches model code. The live path is scripts/accept-chrome.mjs (opt-in).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserService, PINNED_VENDOR_VERSION} from '../src/services/browser.mjs';
import {BrokerError} from '../src/secrets/client.mjs';

const VALUES = {'work-password': 'sentinel-Browser-5d2e', 'other.label': 'sentinel-Other-91fa'};
const REF = label => `{{secret:${label}}}`;
const fill = (value, extra = {}, method = 'executeWithRecovery') => ({method, params: {type: 'playwright_locator_fill', browser_id: '2', tab_id: '17', selector: 'internal:label="Password"s', value, replace: true, timeout_ms: 10000, ...extra}});
const ax = (action, method = 'executeWithRecovery') => ({method, params: {type: 'tab_ax_action', browser_id: '2', tab_id: '17', action}});
const axPaste = (text, extra = {}) => ax({kind: 'paste', element_index: 3, text, ...extra});
const axType = (text, extra = {}) => ax({kind: 'type_text', element_index: null, text, ...extra});
const axSet = (value, extra = {}) => ax({kind: 'set_value', element_index: 5, value, ...extra});

function harness({answer = () => ({ok: true, value: {}}), secretsUnavailable = null, read, version = PINNED_VENDOR_VERSION} = {}) {
  const received = [];
  const reads = [];
  const vendor = {handleRpc: async request => { received.push(structuredClone(request)); return answer(request); }};
  const secrets = {
    read: read ?? (async label => {
      reads.push(label);
      if (!Object.hasOwn(VALUES, label)) throw new BrokerError('not_found', label);
      return VALUES[label];
    }),
  };
  const service = createBrowserService({loadVendor: async () => vendor, vendorVersion: async () => version, secrets, secretsUnavailable});
  return {service, received, reads};
}

const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };
const exposed = error => [error?.message, error?.stack, JSON.stringify(error ?? null), String(error?.cause ?? '')].join('\n');
const assertValueFree = (thing, ...values) => {
  const text = thing instanceof Error ? exposed(thing) : JSON.stringify(thing);
  for (const value of values.length ? values : Object.values(VALUES)) assert.ok(!text.includes(value), `exposed ${value}`);
};

test('ordinary values and every other command are delegated unchanged and never read a secret', async () => {
  const {service, received, reads} = harness({answer: request => ({echo: request.method})});
  const requests = [
    {method: 'setup', params: {environment: 'codex-app'}},
    fill('hello'), fill('x{{secret:work-password}}'), fill('{{ secret:work-password }}'),
    axPaste('plain'), axType('{{secret:work-password}} '), axSet('42'),
    {method: 'execute', params: {type: 'playwright_evaluate', browser_id: '2', tab_id: '17', script: REF('work-password')}},
    {method: 'execute', params: {type: 'playwright_locator_press', browser_id: '2', tab_id: '17', selector: 's', value: REF('work-password')}},
    {method: 'execute', params: {type: 'cdp', browser_id: '2', tab_id: '17', method: 'Input.insertText', params: {text: REF('work-password')}}},
    ax({kind: 'press_key', element_index: null, key: REF('work-password')}),
    ax({kind: 'select_text', element_index: 1, text: REF('work-password')}),
    {method: 'execute', params: {type: 'tab_ax_action', browser_id: '2', tab_id: '17', action: 'not an object'}},
    {method: 'execute', params: 'not an object'},
    {method: 'unknownMethod', params: fill(REF('work-password')).params},
  ];
  for (const request of requests) {
    const result = await service.handleRpc(request);
    assert.deepEqual(received.at(-1), request);
    assert.deepEqual(result, {echo: request.method});
  }
  assert.deepEqual(reads, []);
});

test('an exact reference in each eligible field is replaced by the stored value before the vendor sees it', async () => {
  const {service, received} = harness();
  const cases = [
    [fill(REF('work-password')), r => r.params.value],
    [fill(REF('work-password'), {}, 'execute'), r => r.params.value],
    [axPaste(REF('work-password')), r => r.params.action.text],
    [axPaste(REF('work-password'), {format: 'text'}), r => r.params.action.text],
    [axType(REF('work-password')), r => r.params.action.text],
    [axSet(REF('other.label')), r => r.params.action.value],
  ];
  for (const [request, field] of cases) {
    await service.handleRpc(request);
    const got = received.at(-1);
    const expected = structuredClone(request);
    const label = field(request).slice(9, -2);
    if (request.params.type === 'playwright_locator_fill') expected.params.value = VALUES[label];
    else expected.params.action[request.params.action.kind === 'set_value' ? 'value' : 'text'] = VALUES[label];
    assert.deepEqual(got, expected, JSON.stringify(request));
    assert.equal(field(request), REF(label), 'the caller\'s request object is not modified');
  }
});

test('the fill shape the vendor client sends without a timeout (absent or undefined) is still eligible', async () => {
  const {service, received} = harness();
  const absent = fill(REF('work-password'));
  delete absent.params.timeout_ms;
  await service.handleRpc(absent);
  assert.equal(received.at(-1).params.value, VALUES['work-password']);
  await service.handleRpc(fill(REF('work-password'), {timeout_ms: undefined, replace: false}));
  assert.equal(received.at(-1).params.value, VALUES['work-password']);
});

test('successful substituted results are returned as the vendor gave them', async () => {
  const {service} = harness({answer: () => ({ok: true, value: {}})});
  assert.deepEqual(await service.handleRpc(fill(REF('work-password'))), {ok: true, value: {}});
  const plain = harness({answer: () => ({})});
  assert.deepEqual(await plain.service.handleRpc(fill(REF('work-password'), {}, 'execute')), {});
});

test('an unknown label, an invalid label and broker failures fail before input, value-free', async () => {
  const {service, received} = harness();
  const missing = await rejection(service.handleRpc(fill(REF('missing-label'))));
  assert.equal(missing.code, 'secret_not_found');
  assert.match(missing.message, /"missing-label"/);
  for (const text of ['{{secret:}}', '{{secret:bad label}}']) {
    const error = await rejection(service.handleRpc(axType(text)));
    assert.equal(error.code, 'invalid_secret_label', text);
  }
  assert.deepEqual(received, []);
  for (const [brokerCode, expected] of [['denied', 'secret_denied'], ['locked', 'secret_locked'], ['disconnected', 'secrets_unavailable']]) {
    const h = harness({read: async () => { throw new BrokerError(brokerCode); }});
    const error = await rejection(h.service.handleRpc(fill(REF('work-password'))));
    assert.equal(error.code, expected, brokerCode);
    assert.deepEqual(h.received, []);
  }
  const odd = harness({read: async () => { throw new Error(`boom ${VALUES['work-password']}`); }});
  assertValueFree(await rejection(odd.service.handleRpc(fill(REF('work-password')))));
});

test('with secrets turned off or unavailable, a reference fails closed and is never entered literally', async () => {
  for (const [reason, code] of [['secrets_disabled', 'secrets_disabled'], ['helper_not_built', 'secrets_unavailable']]) {
    const h = harness({secretsUnavailable: reason});
    for (const request of [fill(REF('work-password')), axPaste(REF('work-password')), axSet(REF('work-password'))]) {
      const error = await rejection(h.service.handleRpc(request));
      assert.equal(error.code, code, reason);
    }
    assert.deepEqual(h.received, []);
    assert.deepEqual(h.reads, []);
    assert.deepEqual(await h.service.handleRpc(fill('ordinary')), {ok: true, value: {}}, 'ordinary input still works');
  }
});

// The vendor looks the service method up by property key and command types by string, so a request that only
// coerces to an eligible one, or carries extra or mistyped fields, fails closed before any read.
const UNSUPPORTED = [
  fill(REF('work-password'), {extra: 1}),
  fill(REF('work-password'), {replace: 'true'}),
  fill(REF('work-password'), {selector: 7}),
  fill(REF('work-password'), {browser_id: 2}),
  fill(REF('work-password'), {timeout_ms: 0}),
  fill(REF('work-password'), {timeout_ms: 1.5}),
  (() => { const r = fill(REF('work-password')); delete r.params.replace; return r; })(),
  (() => { const r = fill(REF('work-password')); delete r.params.tab_id; return r; })(),
  {...fill(REF('work-password')), extra: true},
  {method: ['executeWithRecovery'], params: fill(REF('work-password')).params},
  {method: 'execute', params: {...fill(REF('work-password')).params, type: ['playwright_locator_fill']}},
  axPaste(REF('work-password'), {format: 'html'}),
  axPaste(REF('work-password'), {element_index: -1}),
  axType(REF('work-password'), {element_index: '3'}),
  axSet(REF('work-password'), {element_index: null}),
  axSet(REF('work-password'), {extra: 1}),
  (() => { const r = axType(REF('work-password')); delete r.params.action.element_index; return r; })(),
  {method: 'execute', params: {...axType(REF('work-password')).params, extra: 1}},
  {method: 'execute', params: {...axType(REF('work-password')).params, action: {kind: ['type_text'], element_index: null, text: REF('work-password')}}},
];

test('a reference in a shape other than the pinned one fails before input instead of guessing', async () => {
  for (const request of UNSUPPORTED) {
    const {service, received, reads} = harness();
    const error = await rejection(service.handleRpc(request));
    assert.equal(error.code, 'unsupported_secret_shape', JSON.stringify(request));
    assert.deepEqual(received, [], `delegated ${JSON.stringify(request)}`);
    assert.deepEqual(reads, []);
  }
});

test('secret input is refused on a vendor browser service other than the pinned version, before any read', async () => {
  for (const version of ['0.1.2', null]) {
    const {service, received, reads} = harness({version});
    const error = await rejection(service.handleRpc(fill(REF('work-password'))));
    assert.equal(error.code, 'unsupported_browser_runtime', String(version));
    assert.match(error.message, /0\.1\.1/);
    assert.deepEqual(received, []);
    assert.deepEqual(reads, []);
    assert.deepEqual(await service.handleRpc(fill('ordinary')), {ok: true, value: {}}, 'ordinary commands still delegate');
  }
});

test('a substituted command the vendor rejects becomes a bounded value-free classification', async () => {
  const value = VALUES['work-password'];
  const named = (name, props = {}) => () => { const e = new Error(`failed near ${value}`); e.name = name; Object.assign(e, props); throw e; };
  const cases = [
    ['plain error with the value', () => { throw new Error(`locator.fill failed: ${value}`); }, 'failed'],
    ['error with a cause', () => { throw new Error('x', {cause: new Error(value)}); }, 'failed'],
    ['a thrown string', () => { throw `raw ${value}`; }, 'failed'],
    ['security refusal', named('BrowserUseSecurityError', {reason: 'user_declined'}), 'security:user_declined'],
    ['security refusal with an unknown reason', named('BrowserUseSecurityError', {reason: value}), 'failed'],
    ['recovery error', named('BrowserCredentialRecoveryError', {details: {reason: 'protected_command_failed'}}), 'recovery:protected_command_failed'],
    ['schema error', named('ZodError'), 'invalid_command'],
  ];
  for (const [name, thrower, kind] of cases) {
    const {service} = harness({answer: thrower});
    const error = await rejection(service.handleRpc(fill(REF('work-password'))));
    assert.equal(error.code, 'secret_input_failed', name);
    assert.equal(error.cause, undefined, name);
    assertValueFree(error);
    assert.ok(error.message.length <= 400, `${name}: ${error.message.length} chars`);
    assert.match(error.message, /"work-password"/);
    assert.ok(error.message.includes(`(${kind})`), `${name}: ${error.message}`);
  }
});

test('an {ok:false} recovery envelope after substitution is rewritten to the same value-free classification', async () => {
  const envelope = {ok: false, error: {schema_version: 1, command: 'playwright_locator_fill', phase: 'execute', reason: 'protected_command_failed', next_action: 'stop', echoed: VALUES['work-password']}};
  const {service} = harness({answer: () => envelope});
  const error = await rejection(service.handleRpc(fill(REF('work-password'))));
  assert.equal(error.code, 'secret_input_failed');
  assert.match(error.message, /\(recovery:protected_command_failed\)/);
  assertValueFree(error);
  const odd = harness({answer: () => ({ok: false, error: {reason: VALUES['work-password']}})});
  const oddError = await rejection(odd.service.handleRpc(fill(REF('work-password'))));
  assert.match(oddError.message, /\(recovery\)/);
  assertValueFree(oddError);
});

test('failures and envelopes of unsubstituted commands keep the vendor\'s own result untouched', async () => {
  const original = new Error('locator.fill failed for selector #x');
  assert.equal(await rejection(harness({answer: () => { throw original; }}).service.handleRpc(fill('ordinary'))), original);
  const envelope = {ok: false, error: {schema_version: 1, reason: 'protected_command_failed'}};
  assert.equal(await harness({answer: () => envelope}).service.handleRpc(fill('ordinary')), envelope);
});

test('the wrapper never writes to the console or standard streams, on success or failure', async t => {
  const writes = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace']) t.mock.method(console, method, (...args) => writes.push(args));
  t.mock.method(process.stdout, 'write', chunk => { writes.push(chunk); return true; });
  t.mock.method(process.stderr, 'write', chunk => { writes.push(chunk); return true; });
  await harness().service.handleRpc(fill(REF('work-password')));
  await rejection(harness().service.handleRpc(fill(REF('missing'))));
  await rejection(harness({answer: () => { throw new Error(VALUES['work-password']); }}).service.handleRpc(fill(REF('work-password'))));
  t.mock.restoreAll();
  assert.deepEqual(writes, []);
});

test('the vendor service loads once, and a load failure on a substituted call is reported without a value', async () => {
  let loads = 0;
  const service = createBrowserService({loadVendor: async () => { loads++; return {handleRpc: async () => ({ok: true, value: {}})}; }, vendorVersion: async () => PINNED_VENDOR_VERSION, secrets: {read: async () => 'v'}});
  await service.handleRpc({method: 'setup', params: {}});
  await service.handleRpc(fill(REF('work-password')));
  assert.equal(loads, 1);
  const broken = createBrowserService({loadVendor: async () => { throw new Error('cannot import'); }, vendorVersion: async () => PINNED_VENDOR_VERSION, secrets: {read: async () => VALUES['work-password']}});
  assertValueFree(await rejection(broken.handleRpc(fill(REF('work-password')))));
});

// The vendor client's transport (FunctionAgentTransport.send in browser-client.mjs) adds client_timeout_ms to every
// command: the locator's timeoutMs when positive, else undefined. Observed live in M11's C2 run as a refused fill.
test('the transport field client_timeout_ms the vendor client adds to every command is part of the pinned shapes', async () => {
  const {service, received} = harness();
  await service.handleRpc(fill(REF('work-password'), {client_timeout_ms: 10000}));
  assert.equal(received.at(-1).params.value, VALUES['work-password']);
  assert.equal(received.at(-1).params.client_timeout_ms, 10000);
  await service.handleRpc(fill(REF('work-password'), {client_timeout_ms: undefined}));
  assert.equal(received.at(-1).params.value, VALUES['work-password']);
  await service.handleRpc({method: 'executeWithRecovery', params: {...axType(REF('other.label')).params, client_timeout_ms: 5000}});
  assert.equal(received.at(-1).params.action.text, VALUES['other.label']);
  for (const bad of [0, -1, 1.5, '10000', null]) {
    const h = harness();
    const error = await rejection(h.service.handleRpc(fill(REF('work-password'), {client_timeout_ms: bad})));
    assert.equal(error.code, 'unsupported_secret_shape', String(bad));
    assert.deepEqual(h.reads, []);
  }
});
