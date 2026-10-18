// The compat executable's app-server (#115 M2, src/sandbox/app-server.mjs): the native helper's policy read answered
// from the recorded responses, newline-delimited JSON-RPC on stdin and stdout, in order, until EOF.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {readFileSync} from 'node:fs';
import {RECORDED_RESPONSES, recordedResponses, serveAppServer} from '../../src/sandbox/app-server.mjs';

const CODEX_HOME = '/h/cua/state/codex';
const responses = recordedResponses({CODEX_HOME});

// Feeds `lines` to a served app-server and returns every message it wrote, once it resolved on EOF.
async function exchange(lines, {end = true} = {}) {
  const input = new PassThrough(), output = new PassThrough();
  let written = '';
  output.on('data', chunk => { written += chunk; });
  const served = serveAppServer({input, output, responses});
  for (const line of lines) input.write(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`);
  if (end) input.end();
  await served;
  return written.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

test('the recorded responses are M0\'s audited capture, rendered for this CODEX_HOME and its cua home', () => {
  const captured = JSON.parse(readFileSync(new URL('../../docs/evidence/2026-10-17-own-sandbox/m0/app-server/app-server-responses.json', import.meta.url), 'utf8'));
  assert.deepEqual(RECORDED_RESPONSES, captured.responses);
  assert.deepEqual(Object.keys(responses), ['initialize', 'configRequirements/read', 'config/read']);
  assert.equal(responses.initialize.codexHome, CODEX_HOME);
  assert.equal(responses['config/read'].origins['notify.0'].name.file, `${CODEX_HOME}/config.toml`);
  assert.match(responses['config/read'].config.notify[0], /^\/h\/cua\/runtimes\//);
  assert.doesNotMatch(JSON.stringify(responses), /\$\{/);
});

test('recordedResponses refuses a CODEX_HOME that is missing or relative', () => {
  assert.throws(() => recordedResponses({}), /CODEX_HOME/);
  assert.throws(() => recordedResponses({CODEX_HOME: 'state/codex'}), /CODEX_HOME/);
});

test('the three recorded methods are answered in order with their results, framed as the helper frames its requests', async () => {
  const out = await exchange([
    {id: 'A', method: 'initialize', params: {clientInfo: {name: 'codex-computer-use'}}},
    {id: 'B', method: 'configRequirements/read', params: null},
    {jsonrpc: '2.0', id: 7, method: 'config/read', params: {includeLayers: false}},
  ]);
  assert.deepEqual(out.map(m => m.id), ['A', 'B', 7]);
  assert.deepEqual(out[0], {id: 'A', result: responses.initialize});
  assert.deepEqual(out[1], {id: 'B', result: {requirements: null}});
  assert.deepEqual(out[2], {jsonrpc: '2.0', id: 7, result: responses['config/read']});
});

test('notifications are ignored; any other method gets -32601 with a sentence', async () => {
  const out = await exchange([
    {method: 'initialized'},
    {id: 'C', method: 'getAuthStatus', params: {}},
    {id: 'D', method: 'initialize'},
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'C');
  assert.equal(out[0].error.code, -32601);
  assert.match(out[0].error.message, /getAuthStatus.*initialize, configRequirements\/read, config\/read/);
  assert.equal(out[1].id, 'D');
});

test('a line that is not JSON gets a parse error, and serving continues', async () => {
  const out = await exchange(['{not json', {id: 'E', method: 'configRequirements/read'}]);
  assert.deepEqual(out[0].id, null);
  assert.equal(out[0].error.code, -32700);
  assert.deepEqual(out[1], {id: 'E', result: {requirements: null}});
});

test('it resolves on EOF, with nothing written for an empty input', async () => {
  assert.deepEqual(await exchange([]), []);
});
