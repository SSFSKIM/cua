// The trusted sky wrapper with test doubles for the vendor service and the broker client. What the vendor module
// receives is what native input would get; what the wrapper returns or throws is what reaches model code (the trusted
// worker turns a rejection into its message). The live path through node_repl's trusted worker, nativePipe and the
// actual Swift broker is scripts/probe-secrets.mjs (opt-in).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSkyService} from '../src/services/sky.mjs';
import {BrokerError} from '../src/secrets/client.mjs';

const VALUES = {'work-password': 'sentinel-Value-1f9c', 'other.label': 'sentinel-Other-77ab'};
const REF = label => `{{secret:${label}}}`;
const paste = (text, extra = {}) => ({type: 'execute', method: 'paste', args: [{app: 'com.apple.TextEdit', text, format: 'text', ...extra}]});
const typeText = text => ({type: 'execute', method: 'type_text', args: [{app: 'com.apple.TextEdit', text}]});
const setValue = value => ({type: 'execute', method: 'set_value', args: [{app: 'com.apple.TextEdit', element_index: 4, value}]});

// A vendor double recording each request it is given, answering with `answer(request)` (which may throw).
function harness({answer = () => undefined, secretsUnavailable = null, read} = {}) {
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
  const service = createSkyService({loadVendor: async () => vendor, secrets, secretsUnavailable});
  return {service, received, reads};
}

const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };
// Everything a failure exposes: what the trusted worker forwards (message) and anything a logger could print.
const exposed = error => [error?.message, error?.stack, JSON.stringify(error ?? null), String(error?.cause ?? '')].join('\n');
const assertValueFree = (error, ...values) => {
  for (const value of values.length ? values : Object.values(VALUES)) assert.ok(!exposed(error).includes(value), `exposed ${value}`);
};

test('ordinary text input and every other request are delegated unchanged and never read a secret', async () => {
  const {service, received, reads} = harness({answer: request => ({echo: request.method ?? request.type})});
  const requests = [
    {type: 'setup'},
    paste('hello'), typeText('plain text'), setValue('42'),
    paste('x{{secret:work-password}}'), typeText('{{secret:work-password}} '), setValue('{{ secret:work-password }}'),
    {type: 'execute', method: 'list_apps', args: []},
    {type: 'execute', method: 'press_key', args: [{app: 'a', key: REF('work-password')}]},
    {type: 'execute', method: 'select_text', args: [{app: 'a', element_index: 1, text: REF('work-password')}]},
    {type: 'execute', method: 'type_text', args: 'not an array'},
    {type: 'execute', method: 'type_text', args: [{app: 'a', text: 7}]},
    {type: 'drag_start', handle_id: 'h', point: [1, 2]},
  ];
  for (const request of requests) {
    const result = await service.handleRpc(request);
    assert.deepEqual(received.at(-1), request);
    assert.deepEqual(result, {echo: request.method ?? request.type});
  }
  assert.deepEqual(reads, []);
});

test('an exact reference in each native text field is replaced by the stored value before the vendor sees it', async () => {
  const {service, received, reads} = harness();
  const cases = [
    [paste(REF('work-password')), r => r.args[0].text],
    [typeText(REF('work-password')), r => r.args[0].text],
    [setValue(REF('work-password')), r => r.args[0].value],
  ];
  for (const [request, field] of cases) {
    const before = structuredClone(request);
    assert.equal(await service.handleRpc(request), undefined);
    const delivered = received.at(-1);
    assert.equal(field(delivered), VALUES['work-password']);
    assert.deepEqual({...delivered, args: [{...delivered.args[0], text: undefined, value: undefined}]}, {...before, args: [{...before.args[0], text: undefined, value: undefined}]}, 'only the eligible field changes');
    assert.deepEqual(request, before, "the caller's request is not modified");
  }
  assert.deepEqual(reads, ['work-password', 'work-password', 'work-password']);
});

test('paste without a format, the shape the cua API omits nothing from, is still eligible', async () => {
  const {service, received} = harness();
  await service.handleRpc({type: 'execute', method: 'paste', args: [{app: 'a', text: REF('other.label')}]});
  assert.equal(received[0].args[0].text, VALUES['other.label']);
});

test('simultaneous references resolve independently, whatever order the broker answers in', async () => {
  const gates = {};
  const read = label => new Promise(resolve => { gates[label] = () => resolve(VALUES[label]); });
  const {service, received} = harness({read});
  const first = service.handleRpc(typeText(REF('work-password')));
  const second = service.handleRpc(setValue(REF('other.label')));
  await new Promise(r => setImmediate(r));
  gates['other.label']();
  await second;
  gates['work-password']();
  await first;
  assert.equal(received.find(r => r.method === 'type_text').args[0].text, VALUES['work-password']);
  assert.equal(received.find(r => r.method === 'set_value').args[0].value, VALUES['other.label']);
});

test('an unknown label fails before input, naming the label but nothing else', async () => {
  const {service, received} = harness();
  const error = await rejection(service.handleRpc(typeText(REF('missing-label'))));
  assert.equal(error.code, 'secret_not_found');
  assert.match(error.message, /"missing-label"/);
  assert.match(error.message, /\[secret_not_found\]$/);
  assert.match(error.message, /nothing was entered/);
  assert.deepEqual(received, []);
});

test('a reference-shaped argument with an invalid label fails before input and is not echoed', async () => {
  const {service, received, reads} = harness();
  for (const text of ['{{secret:}}', '{{secret:bad label}}', '{{secret:work-password}}{{secret:other.label}}']) {
    const error = await rejection(service.handleRpc(paste(text)));
    assert.equal(error.code, 'invalid_secret_label', text);
    assert.ok(!error.message.includes(text.slice(9, -2)) || text === '{{secret:}}', `echoed ${text}`);
  }
  assert.deepEqual(received, []);
  assert.deepEqual(reads, []);
});

test('Keychain and broker failures fail before input with a value-free classified error', async () => {
  const cases = [
    ['denied', 'secret_denied'], ['locked', 'secret_locked'], ['unsupported_value', 'secret_unsupported_value'],
    ['disconnected', 'secrets_unavailable'], ['timeout', 'secrets_unavailable'], ['unauthorized', 'secrets_unavailable'],
    ['protocol', 'secrets_unavailable'], ['unavailable', 'secrets_unavailable'], ['not_configured', 'secrets_unavailable'],
  ];
  for (const [brokerCode, expected] of cases) {
    const {service, received} = harness({read: async () => { throw new BrokerError(brokerCode); }});
    const error = await rejection(service.handleRpc(typeText(REF('work-password'))));
    assert.equal(error.code, expected, brokerCode);
    assert.match(error.message, new RegExp(`\\[${expected}\\]$`));
    assert.deepEqual(received, [], brokerCode);
  }
  const odd = harness({read: async () => { throw new Error(`boom ${VALUES['work-password']}`); }});
  const error = await rejection(odd.service.handleRpc(typeText(REF('work-password'))));
  assert.equal(error.code, 'secrets_unavailable');
  assertValueFree(error);
});

test('with secrets turned off or no broker, a reference fails closed and is never typed literally', async () => {
  const off = harness({secretsUnavailable: 'secrets_disabled'});
  const disabled = await rejection(off.service.handleRpc(paste(REF('work-password'))));
  assert.equal(disabled.code, 'secrets_disabled');
  assert.match(disabled.message, /CUA_SHIM_SECRETS=off/);
  const missing = harness({secretsUnavailable: 'helper_not_built'});
  const unavailable = await rejection(missing.service.handleRpc(setValue(REF('work-password'))));
  assert.equal(unavailable.code, 'secrets_unavailable');
  assert.match(unavailable.message, /helper_not_built/);
  for (const h of [off, missing]) {
    assert.deepEqual(h.received, []);
    assert.deepEqual(h.reads, []);
    assert.deepEqual(await h.service.handleRpc(typeText('ordinary')), undefined, 'ordinary input still works');
  }
});

test('a reference in a shape other than the pinned one fails before input instead of guessing', async () => {
  const {service, received, reads} = harness();
  const shapes = [
    {type: 'execute', method: 'type_text', args: [{app: 'a', text: REF('work-password')}, {}]},
    {type: 'execute', method: 'type_text', args: [{app: 'a', text: REF('work-password'), delay: 5}]},
    {type: 'execute', method: 'type_text', args: [{app: 'a', text: REF('work-password')}], extra: true},
    {type: 'execute', method: 'set_value', args: [{app: 'a', value: REF('work-password')}]},
    {type: 'execute', method: 'type_text', args: [{text: REF('work-password')}]},
    paste(REF('work-password'), {format: 'html'}),
  ];
  for (const request of shapes) {
    const error = await rejection(service.handleRpc(request));
    assert.equal(error.code, 'unsupported_secret_shape', JSON.stringify(request));
  }
  assert.deepEqual(received, []);
  assert.deepEqual(reads, []);
});

test('a failed substituted command returns a bounded value-free diagnostic, never the vendor error', async () => {
  const value = VALUES['work-password'];
  class SkyComputerUseError extends Error {
    constructor() { super(`helper rejected type ${value}`); this.name = 'SkyComputerUseError'; this.errorName = 'runningApplicationNotFound'; this.request = {text: value}; }
  }
  const throwers = {
    'vendor error with the value in message, stack and properties': () => { throw new SkyComputerUseError(); },
    'vendor error with an unknown error name': () => { const e = new SkyComputerUseError(); e.errorName = value; throw e; },
    'plain error with a cause carrying the value': () => { throw new Error('failed', {cause: new Error(value)}); },
    'a thrown string': () => { throw `raw ${value}`; },
    'an approval refusal': () => { throw new Error('Computer Use was not approved to use TextEdit'); },
  };
  for (const [name, thrower] of Object.entries(throwers)) {
    const {service} = harness({answer: thrower});
    const error = await rejection(service.handleRpc(typeText(REF('work-password'))));
    assert.equal(error.code, 'secret_input_failed', name);
    assert.ok(error instanceof Error);
    assert.equal(error.cause, undefined, name);
    assertValueFree(error);
    assert.ok(error.message.length <= 400, `${name}: ${error.message.length} chars`);
    assert.match(error.message, /"work-password"/);
  }
  const known = await rejection(harness({answer: throwers['vendor error with the value in message, stack and properties']}).service.handleRpc(typeText(REF('work-password'))));
  assert.match(known.message, /runningApplicationNotFound/, 'a known vendor error name is kept');
  const refused = await rejection(harness({answer: throwers['an approval refusal']}).service.handleRpc(typeText(REF('work-password'))));
  assert.match(refused.message, /not_approved/);
});

test('failures of ordinary (non-secret) commands keep the vendor error untouched', async () => {
  const original = new Error('Sky runtime method is not available: nope');
  const {service} = harness({answer: () => { throw original; }});
  assert.equal(await rejection(service.handleRpc(typeText('ordinary'))), original);
});

test('the wrapper never writes to the console or standard streams, on success or failure', async t => {
  const writes = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace']) t.mock.method(console, method, (...args) => writes.push(args));
  t.mock.method(process.stdout, 'write', chunk => { writes.push(chunk); return true; });
  t.mock.method(process.stderr, 'write', chunk => { writes.push(chunk); return true; });
  const ok = harness();
  await ok.service.handleRpc(paste(REF('work-password')));
  await rejection(ok.service.handleRpc(paste(REF('missing'))));
  await rejection(harness({answer: () => { throw new Error(VALUES['work-password']); }}).service.handleRpc(paste(REF('work-password'))));
  t.mock.restoreAll();
  assert.deepEqual(writes, []);
});

test('the vendor service loads once, and a load failure is reported without a value', async () => {
  let loads = 0;
  const service = createSkyService({loadVendor: async () => { loads++; return {handleRpc: async () => 'ok'}; }, secrets: {read: async () => 'v'}});
  await service.handleRpc({type: 'setup'});
  await service.handleRpc(typeText(REF('work-password')));
  assert.equal(loads, 1);
  const broken = createSkyService({loadVendor: async () => { throw new Error('cannot import'); }, secrets: {read: async () => VALUES['work-password']}});
  const error = await rejection(broken.handleRpc(typeText(REF('work-password'))));
  assertValueFree(error);
});

// The vendor service looks the method up by property key, which coerces (["paste"] reaches paste). A request that
// carries a reference must therefore be pinned by primitive type, not only by key name, before any secret is read.
const COERCED = [
  {type: 'execute', method: ['paste'], args: [{app: 'a', text: REF('work-password'), format: 'html'}]},
  {type: 'execute', method: ['paste'], args: [{app: 'a', text: REF('work-password'), format: 'text'}]},
  {type: 'execute', method: ['type_text'], args: [{app: 'a', text: REF('work-password')}]},
  {type: 'execute', method: ['set_value'], args: [{app: 'a', element_index: 4, value: REF('work-password')}]},
  {type: 'execute', method: 'paste', args: [{app: 'a', text: REF('work-password'), format: ['text']}]},
  {type: 'execute', method: 'type_text', args: [{app: ['a'], text: REF('work-password')}]},
  {type: 'execute', method: 'set_value', args: [{app: 'a', element_index: '4', value: REF('work-password')}]},
  {type: 'execute', method: 'set_value', args: [{app: 'a', element_index: [4], value: REF('work-password')}]},
  {type: 'execute', method: 'set_value', args: [{app: 'a', element_index: 1.5, value: REF('work-password')}]},
];

test('a reference in a request whose method or fields are not the pinned primitive types fails closed before any read', async () => {
  for (const request of COERCED) {
    const {service, received, reads} = harness();
    const error = await rejection(service.handleRpc(request));
    assert.equal(error.code, 'unsupported_secret_shape', JSON.stringify(request));
    assert.deepEqual(received, [], `delegated ${JSON.stringify(request)}`);
    assert.deepEqual(reads, [], `read a secret for ${JSON.stringify(request)}`);
  }
});

test('with secrets off or unavailable, a coerced-method reference still fails closed and is never delegated literally', async () => {
  for (const secretsUnavailable of ['secrets_disabled', 'helper_not_built']) {
    for (const request of COERCED.slice(0, 4)) {
      const {service, received, reads} = harness({secretsUnavailable});
      const error = await rejection(service.handleRpc(request));
      assert.ok(['unsupported_secret_shape', 'secrets_disabled', 'secrets_unavailable'].includes(error.code), `${secretsUnavailable}: ${error.code}`);
      assert.deepEqual(received, [], `${secretsUnavailable}: delegated ${JSON.stringify(request)}`);
      assert.deepEqual(reads, []);
    }
  }
});
