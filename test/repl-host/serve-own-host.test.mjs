// A real cua connection (src/mcp/connection.mjs) on cua's own REPL host: the proxy, its anchor-owned process group,
// the supervisor and kernel, the scoped sandbox state the proxy stamps, end_task's turn_ended completion and the
// connection's teardown. The installed runtime is a forged home (test/fixtures/installed-home.mjs) whose sandbox
// launcher is the recording double; no vendor process runs. The production banner imports cua's own facade
// (src/cua-api/bootstrap.mjs), so the chain banner -> kernel -> host -> trusted worker -> cua's browser wrapper and
// service runs for real and the first cell carries the first-call document. Needs Node 24 or later for the kernel
// (CUA_NODE).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, chmodSync, readFileSync} from 'node:fs';
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
import {toolOverrides} from '../../src/repl-host/instructions.mjs';

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
  const listed = (await request('tools/list', {})).result.tools;
  assert.deepEqual(listed.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list', 'profiles_list', 'devices_list', 'devices_use'].filter(name => !name.startsWith('devices')));
  const effective = toolOverrides({platform: process.platform, surfaces: ['browser']}).tools;
  assert.ok(listed[0].description.endsWith(effective.js.description), 'the effective js text, below the proxy\'s host rules');
  assert.equal(listed[0].inputSchema.properties.code.description, effective.js.field_descriptions.code);
  assert.equal(listed[1].description, effective.js_reset.description);

  const first = await call('js', {code: 'let kept=41;nodeRepl.write(JSON.stringify(Object.keys(nodeRepl.requestMeta)))'});
  assert.equal(first.isError, false, JSON.stringify(first.content));
  assert.deepEqual(first._meta[REPL_HOST_META_KEY], {host: 'cua', version: REPL_HOST_VERSION});
  assert.equal(typeof first._meta['cua/taskId'], 'string');
  const doc = name => readFileSync(new URL(`../../docs/cua-api/${name}`, import.meta.url), 'utf8');
  assert.equal(first.content[0].text, `${doc('core.md')}\n${doc('confirmations.md')}`, 'the bootstrap\'s first-call document leads the first cell');
  assert.deepEqual(JSON.parse(first.content[1].text), ['callId', 'sessionId', 'threadId', 'x-codex-turn-metadata'], 'the proxy\'s turn metadata, without its sandbox state');
  assert.equal((await call('js', {code: 'nodeRepl.write(kept+1)'})).content[0].text, '42');
  assert.deepEqual(JSON.parse((await call('js', {code: 'nodeRepl.write(JSON.stringify([Object.keys(cua).sort(), typeof agent.browsers.list, await cua.listBrowsers({emit: false})]))'})).content[0].text),
    [['browsers', 'createBrowserTab', 'getBrowser', 'getState', 'getTab', 'initialize', 'listBrowsers', 'listTabs', 'rewriteDocumentation'], 'function', []],
    'the owned facade, set up through the trusted worker and cua\'s browser service (no backends here)');
  const [launch, workerLaunch, ...more] = launches(homeLayout(home).codexHome);
  assert.equal(more.length, 0, 'one kernel and one trusted worker');
  for (const child of [launch, workerLaunch])
    assert.match(child.argv[6], /":tmpdir" = "write", ":workspace_roots" = \{"\." = "write"\}\}, network = \{enabled = false\}\}$/, 'the scoped policy the proxy sent, for both children');
  assert.match(workerLaunch.argv.at(-2), /src\/repl-host\/trusted-worker\.mjs$/);
  assert.equal((await call('js_reset')).content[0].text, 'js kernel reset');
  assert.deepEqual((await call('js', {code: 'nodeRepl.write(typeof kept)'})).content.map(item => item.text), [`${doc('core.md')}\n${doc('confirmations.md')}`, 'undefined'],
    'bindings gone, and a fresh bootstrap writes the first-call document again');
  const ended = (await call('end_task')).structuredContent;
  assert.deepEqual([ended.status, ended.ended], ['ended', true]);

  input.end();
  const closed = await connection.closed;
  assert.equal(closed.code, 0);
  assert.equal(closed.teardown.confirmed, true);
});
