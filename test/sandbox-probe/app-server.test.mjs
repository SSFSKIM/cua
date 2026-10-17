// The app-server capture's audit and the replay stub's answers (#115 M0, scripts/sandbox-probe/app-server.mjs). The
// audit keeps what the helper asked and what the signed CLI answered, renders the environment's paths as placeholders,
// and withholds (naming the field, never its value) anything credential- or account-shaped; the replay answers the
// recorded methods with the recorded results rendered for its own environment, and nothing else.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditExchange, renderResponses, replayAnswer} from '../../scripts/sandbox-probe/app-server.mjs';

const env = {CODEX_HOME: '/scratch/home/state/codex', CUA_HOME: '/scratch/home', HOME: '/scratch/user'};
const rec = (dir, message) => ({t: '2026-10-17T00:00:00.000Z', dir, line: JSON.stringify(message)});

const exchange = [
  rec('in', {id: 'a1', method: 'initialize', params: {clientInfo: {name: 'sky', version: '1.0'}}}),
  rec('out', {id: 'a1', result: {userAgent: 'codex_cli_rs/0.159.2', codexHome: '/scratch/home/state/codex', platformFamily: 'unix', platformOs: 'macos'}}),
  rec('out', {method: 'remoteControl/status/changed', params: {status: 'disabled'}}),
  rec('in', {id: 'a2', method: 'configRequirements/read', params: {}}),
  rec('out', {id: 'a2', result: {requirements: null}}),
  rec('in', {id: 'a3', method: 'config/read', params: {includeLayers: false}}),
  rec('out', {id: 'a3', result: {config: {notify: ['/scratch/home/runtimes/r/SkyComputerUseClient', 'turn-ended'], model: null, account_id: null,
    chatgpt_auth_token: 'eyJhbGciOi.payload.sig', api_key: '', forced_login_method: 'chatgpt', allow_login_shell: true, cli_auth_credentials_store: 'file',
    chatgpt_account_id: 'acct_abc', features: {auth_elicitation: true}}, origins: {}}}),
];

test('auditExchange pairs requests with results by id, keeps server notifications, and renders paths from the environment', () => {
  const audit = auditExchange(exchange, {env});
  assert.deepEqual(audit.requests.map(r => r.method), ['initialize', 'configRequirements/read', 'config/read']);
  assert.deepEqual(audit.requests[0].params, {clientInfo: {name: 'sky', version: '1.0'}});
  assert.equal(audit.responses.initialize.codexHome, '${CODEX_HOME}');
  assert.deepEqual(audit.responses['configRequirements/read'], {requirements: null});
  assert.deepEqual(audit.responses['config/read'].config.notify, ['${CUA_HOME}/runtimes/r/SkyComputerUseClient', 'turn-ended']);
  assert.deepEqual(audit.serverNotifications, [{method: 'remoteControl/status/changed', params: {status: 'disabled'}}]);
  assert.deepEqual(audit.framing, {jsonrpc: false, idType: 'string'});
});

test('auditExchange withholds credential- and account-shaped values, naming only the field', () => {
  const audit = auditExchange(exchange, {env});
  const config = audit.responses['config/read'].config;
  assert.equal(config.chatgpt_auth_token, '<withheld>');
  assert.equal(config.chatgpt_account_id, '<withheld>', 'an identifier-valued key is withheld whatever its value looks like');
  assert.equal(config.forced_login_method, '<withheld>', 'a login setting outside the allowlist is withheld, enum-shaped or not');
  assert.equal(config.account_id, null, 'an empty value is kept: it reveals nothing');
  assert.equal(config.api_key, '');
  assert.deepEqual(audit.findings.map(f => f.path),
    ['config/read.config.chatgpt_auth_token', 'config/read.config.forced_login_method', 'config/read.config.chatgpt_account_id']);
  assert.ok(audit.findings.every(f => !JSON.stringify(f).includes('eyJ')), 'no withheld value appears in a finding');
  assert.equal(audit.ok, false);
});

test('auditExchange withholds short credential and account values under snake, camel and kebab keys alike', () => {
  const values = {authToken: 'abc', apiKey: 'k1', accountId: 'acct1', account: 'me', installationId: 'u1', 'session-id': 's1',
    'user-email': 'a@b', AccessToken: 'x', deviceId: 'd1', password: 'pw', authMode: 'chatgpt'};
  const audit = auditExchange([rec('in', {id: 1, method: 'initialize', params: {}}), rec('out', {id: 1, result: values})], {env});
  for (const key of Object.keys(values)) assert.equal(audit.responses.initialize[key], '<withheld>', key);
  assert.deepEqual(audit.findings.map(f => f.path).sort(), Object.keys(values).map(k => `initialize.${k}`).sort());
  assert.deepEqual(audit.reviewed, []);
});

test('auditExchange keeps only the allowlisted settings under credential-shaped names, with their allowed values, and lists them as reviewed', () => {
  const audit = auditExchange(exchange, {env});
  const config = audit.responses['config/read'].config;
  assert.equal(config.allow_login_shell, true);
  assert.equal(config.cli_auth_credentials_store, 'file');
  assert.equal(config.features.auth_elicitation, true);
  assert.deepEqual(audit.reviewed, [
    {path: 'config/read.config.allow_login_shell', kept: 'boolean'},
    {path: 'config/read.config.cli_auth_credentials_store', kept: 'string'},
    {path: 'config/read.config.features.auth_elicitation', kept: 'boolean'},
  ]);
  const odd = auditExchange([rec('in', {id: 1, method: 'config/read', params: {}}),
    rec('out', {id: 1, result: {config: {cli_auth_credentials_store: 'sk-live', allow_login_shell: 'yes', features: {auth_elicitation: 1}}}})], {env});
  assert.deepEqual(odd.responses['config/read'].config, {cli_auth_credentials_store: '<withheld>', allow_login_shell: '<withheld>', features: {auth_elicitation: '<withheld>'}},
    'an allowlisted setting with a value outside its allowed set is withheld');
  const elsewhere = auditExchange([rec('in', {id: 1, method: 'initialize', params: {}}), rec('out', {id: 1, result: {allow_login_shell: true}})], {env});
  assert.equal(elsewhere.responses.initialize.allow_login_shell, '<withheld>', 'the allowlist is by path, not by name');
});

test('auditExchange withholds opaque tokens and user paths it cannot render, wherever they sit', () => {
  const audit = auditExchange([
    rec('in', {id: 1, method: 'initialize', params: {}}),
    rec('out', {id: 1, result: {userAgent: 'x', note: 'Qm9vZ2llbWFuQm9vZ2llbWFuQm9vZ2llbWFuMTIzNDU2', where: '/Users/someone/elsewhere/file', codexHome: '/scratch/home/state/codex'}}),
  ], {env});
  assert.equal(audit.responses.initialize.note, '<withheld>');
  assert.equal(audit.responses.initialize.where, '<withheld>');
  assert.deepEqual(audit.findings.map(f => [f.path, f.reason]), [['initialize.note', 'opaque token-shaped value'], ['initialize.where', 'a user path the environment does not render']]);
  assert.deepEqual(audit.framing, {jsonrpc: false, idType: 'number'});
});

test('auditExchange records an error answer and a request that got none', () => {
  const audit = auditExchange([
    rec('in', {id: 1, method: 'getAuthStatus', params: {}}),
    rec('out', {id: 1, error: {code: -32600, message: 'not logged in'}}),
    rec('in', {id: 2, method: 'config/read', params: {}}),
  ], {env});
  assert.deepEqual(audit.errors, {getAuthStatus: {code: -32600, message: 'not logged in'}});
  assert.deepEqual(audit.unanswered, ['config/read']);
});

test('renderResponses fills the placeholders from the replay\'s own environment and refuses a missing name', () => {
  const responses = {initialize: {codexHome: '${CODEX_HOME}', list: ['${CUA_HOME}/x']}};
  assert.deepEqual(renderResponses(responses, {CODEX_HOME: '/h/c', CUA_HOME: '/h'}), {initialize: {codexHome: '/h/c', list: ['/h/x']}});
  assert.throws(() => renderResponses(responses, {CODEX_HOME: '/h/c'}), /CUA_HOME/);
});

test('replayAnswer answers recorded methods in the recorded framing, refuses others with -32601, ignores notifications', () => {
  const responses = {initialize: {ok: 1}, 'config/read': {config: {}}};
  assert.deepEqual(replayAnswer({id: 'x', method: 'initialize', params: {}}, {responses, framing: {jsonrpc: false}}), {id: 'x', result: {ok: 1}});
  assert.deepEqual(replayAnswer({jsonrpc: '2.0', id: 3, method: 'config/read'}, {responses, framing: {jsonrpc: true}}), {jsonrpc: '2.0', id: 3, result: {config: {}}});
  const refused = replayAnswer({id: 4, method: 'getAuthStatus'}, {responses, framing: {jsonrpc: false}});
  assert.equal(refused.error.code, -32601);
  assert.match(refused.error.message, /getAuthStatus/);
  assert.equal(replayAnswer({method: 'initialized'}, {responses, framing: {jsonrpc: false}}), null);
});
