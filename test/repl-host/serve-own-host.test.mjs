// A real cua connection (src/mcp/connection.mjs) on cua's own REPL host: the proxy, its anchor-owned process group,
// the supervisor and kernel, the scoped sandbox state the proxy stamps, end_task's turn_ended completion and the
// connection's teardown. The installed runtime is a forged home (test/fixtures/installed-home.mjs) whose sandbox
// launcher is the recording double; no vendor process runs. Needs Node 24 or later for the kernel (CUA_NODE).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, chmodSync} from 'node:fs';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {fakeInstalledHome, installedHomeSupported, NO_SCOPED_LAUNCH} from '../fixtures/installed-home.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {openConnection} from '../../src/mcp/connection.mjs';
import {homeLayout} from '../../src/runtime/layout.mjs';
import {kernelNode} from './kernel-harness.mjs';
import {launches, sandboxDouble} from './supervisor-harness.mjs';
import {REPL_HOST_META_KEY, REPL_HOST_NAME, REPL_HOST_VERSION} from '../../src/repl-host/identity.mjs';

const {node, skip: noNode} = kernelNode();
const skip = noNode || (!installedHomeSupported && 'no checked-in pin for this host') || NO_SCOPED_LAUNCH;

test('an explicitly selected own host answers a real connection: handshake, cells, reset, end_task and an owned teardown', {skip}, async t => {
  const home = fakeInstalledHome(t);
  const runtime = resolveRuntime({home});
  copyFileSync(sandboxDouble(home), runtime.paths.codexCli);
  chmodSync(runtime.paths.codexCli, 0o755);
  const env = {PATH: '/usr/bin:/bin', HOME: home, TMPDIR: process.env.TMPDIR, CUA_REPL_HOST: 'cua', CUA_NODE: node, CUA_BROWSER_SERVICE: 'cua',
    CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off', CUA_RUNTIME_IDLE_MS: '0'};
  const input = new PassThrough(), output = new PassThrough();
  const pending = new Map();
  createInterface({input: output}).on('line', line => { const msg = JSON.parse(line); pending.get(msg.id)?.(msg); });
  const connection = await openConnection({home, env, sessionId: randomUUID(), input, output, diagnostics: () => {}, chrome: {profiles: []}, listBackends: async () => ({backends: []})});
  t.after(() => connection.close('test end'));
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); input.write(`${JSON.stringify({jsonrpc: '2.0', id: n, method, params})}\n`); });
  const call = async (name, args = {}) => (await request('tools/call', {name, arguments: args})).result;

  const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'own-host-test', version: '0'}});
  assert.deepEqual(init.result.serverInfo, {name: REPL_HOST_NAME, version: REPL_HOST_VERSION});
  const tools = (await request('tools/list', {})).result.tools.map(tool => tool.name);
  assert.deepEqual(tools, ['js', 'js_reset', 'end_task', 'secrets_list', 'profiles_list', 'devices_list', 'devices_use'].filter(name => !name.startsWith('devices')));

  const first = await call('js', {code: 'let kept=41;nodeRepl.write(JSON.stringify(Object.keys(nodeRepl.requestMeta)))'});
  assert.equal(first.isError, false);
  assert.deepEqual(first._meta[REPL_HOST_META_KEY], {host: 'cua', version: REPL_HOST_VERSION});
  assert.equal(typeof first._meta['cua/taskId'], 'string');
  assert.deepEqual(JSON.parse(first.content[0].text), ['callId', 'sessionId', 'threadId', 'x-codex-turn-metadata'], 'the proxy\'s turn metadata, without its sandbox state');
  assert.equal((await call('js', {code: 'nodeRepl.write(kept+1)'})).content[0].text, '42');
  const [launch] = launches(homeLayout(home).codexHome);
  assert.match(launch.argv[6], /":tmpdir" = "write", ":workspace_roots" = \{"\." = "write"\}\}, network = \{enabled = false\}\}$/, 'the scoped policy the proxy sent');
  assert.equal((await call('js_reset')).content[0].text, 'js kernel reset');
  assert.equal((await call('js', {code: 'nodeRepl.write(typeof kept)'})).content[0].text, 'undefined');
  const ended = (await call('end_task')).structuredContent;
  assert.deepEqual([ended.status, ended.ended], ['ended', true]);

  input.end();
  const closed = await connection.closed;
  assert.equal(closed.code, 0);
  assert.equal(closed.teardown.confirmed, true);
});
