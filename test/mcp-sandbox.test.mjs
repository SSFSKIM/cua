// node_repl's per-call sandbox state (issue #20): CUA_SHIM_SANDBOX picks it, the server attaches it to every call it
// makes to the runtime (js, js_reset and the private turn_ended), and a caller's own sandbox entry never reaches the
// runtime, whichever mode is set.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {harness, initialized, structured} from './fixtures/mcp-harness.mjs';
import {settingsFrom} from '../src/mcp/server.mjs';
import {SANDBOX_META_KEY, sandboxModeFrom, sandboxState, withSandbox} from '../src/runtime/sandbox.mjs';

const CWD = '/Users/someone/Library/Application Support/cua/run/sess';
const DISABLED = {permissionProfile: {type: 'disabled'}, sandboxCwd: pathToFileURL(CWD).href};

test('CUA_SHIM_SANDBOX defaults to disabled, accepts default and rejects anything else as an invalid setting', () => {
  assert.equal(SANDBOX_META_KEY, 'codex/sandbox-state-meta');
  assert.equal(settingsFrom({}).sandbox, 'disabled');
  assert.equal(settingsFrom({CUA_SHIM_SANDBOX: 'default'}).sandbox, 'default');
  assert.equal(sandboxModeFrom({}), 'disabled');
  for (const value of ['', 'Disabled', 'off', 'managed', 'disabled,default'])
    assert.throws(() => settingsFrom({CUA_SHIM_SANDBOX: value}), {code: 'invalid_setting', message: /CUA_SHIM_SANDBOX must be disabled or default/});
});

test('disabled is the disabled permission profile with the session directory as an absolute file URI; default is none', () => {
  assert.deepEqual(sandboxState('disabled', CWD), DISABLED);
  assert.match(DISABLED.sandboxCwd, /^file:\/\/\/Users\/someone\/Library\/Application%20Support\//);
  assert.equal(sandboxState('default', CWD), null);
});

test('withSandbox replaces a caller\'s sandbox entry with the server\'s, or drops it when the server sends none', () => {
  const client = {progressToken: 'p', [SANDBOX_META_KEY]: {permissionProfile: {type: 'managed'}}};
  assert.deepEqual(withSandbox(client, DISABLED), {progressToken: 'p', [SANDBOX_META_KEY]: DISABLED});
  assert.deepEqual(withSandbox(client, null), {progressToken: 'p'});
  assert.deepEqual(withSandbox(undefined, null), {});
});

async function oneTask(h, {meta} = {}) {
  await initialized(h);
  const js = h.client.call('js', {code: 'a'}, {meta});
  const upJs = await h.upstream.nextCall('js');
  h.upstream.text(upJs, 'a');
  await js.response;
  const reset = h.client.call('js_reset', {}, {meta});
  const upReset = await h.upstream.nextCall('js_reset');
  h.upstream.text(upReset, 'reset');
  await reset.response;
  const end = h.client.call('end_task');
  const upEnded = await h.upstream.nextCall('turn_ended');
  h.upstream.reply(upEnded, {content: [], isError: false});
  assert.equal(structured(await end.response).status, 'ended');
  return [upJs, upReset, upEnded].map(m => m.params._meta);
}

test('with a sandbox state, js, js_reset and turn_ended all carry it beside the turn metadata', async () => {
  const metas = await oneTask(harness({server: {sandboxState: DISABLED}}));
  for (const meta of metas) {
    assert.deepEqual(meta[SANDBOX_META_KEY], DISABLED);
    assert.equal(meta['x-codex-turn-metadata'].session_id, 'session-under-test');
  }
});

test('without a sandbox state (CUA_SHIM_SANDBOX=default) no call carries the field', async () => {
  const metas = await oneTask(harness({server: {sandboxState: null}}));
  for (const meta of metas) assert.equal(SANDBOX_META_KEY in meta, false);
});

test('a client\'s own sandbox entry is overridden by the server\'s, and dropped when the server sends none; other client _meta is kept', async () => {
  const meta = {progressToken: 'p1', [SANDBOX_META_KEY]: {permissionProfile: {type: 'managed'}, sandboxCwd: 'file:///'}};
  const [js, reset] = await oneTask(harness({server: {sandboxState: DISABLED}}), {meta});
  for (const m of [js, reset]) {
    assert.deepEqual(m[SANDBOX_META_KEY], DISABLED);
    assert.equal(m.progressToken, 'p1');
  }
  const [jsNone, resetNone] = await oneTask(harness({server: {sandboxState: null}}), {meta});
  for (const m of [jsNone, resetNone]) {
    assert.equal(SANDBOX_META_KEY in m, false);
    assert.equal(m.progressToken, 'p1');
  }
});
