// The lazy runtime (issue #105): `cua serve` answers the MCP handshake and the tool list with no vendor runtime, once
// the release's handshake is recorded, and launches the runtime on the first call that needs it; calls that need none
// never start one, and a connection that never launched closes clean. Served in process with a counting
// `prepareLaunch` (one call per launch) against a scratch CUA_HOME whose "installed" release runs the fake upstream
// (test/fixtures/installed-home.mjs), and as real `cua serve` processes for the signal paths.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createServer as createNetServer} from 'node:net';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {PassThrough} from 'node:stream';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';
import {fakeUpstream, harness, textOf, tick} from './fixtures/mcp-harness.mjs';
import {serve} from '../src/mcp/server.mjs';
import {handshakeRecords, lazyRuntime} from '../src/mcp/lazy-runtime.mjs';
import {loadPins, selectPin} from '../src/runtime/manifest.mjs';
import {homeLayout} from '../src/runtime/layout.mjs';
import {chromeFacts, chromeUserData, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {createFakeMawsExtension} from './helpers/fake-maws-peer.mjs';

const supported = installedHomeSupported;
const INIT = {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'lazy-e2e', version: '0'}};
const release = () => selectPin(loadPins()).release;
const recordDir = home => join(homeLayout(home).handshake, release());
// The fake upstream's log, from the last runtime start on: what the connection's own runtime received.
const runtimeLog = home => {
  const path = join(home, 'state', 'codex', 'fake-upstream.jsonl');
  if (!existsSync(path)) return null;
  const entries = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  return entries.slice(entries.findLastIndex(e => e.start));
};

// One in-process `cua serve` over a stream pair, launches counted by its prepareLaunch.
function served(t, home, {env = {}, ...options} = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const launches = [];
  const diagnostics = [];
  const user = scratch();
  t.after(user.cleanup);
  const exit = serve({home, env: {...process.env, HOME: user.dir, CUA_SHIM_SECRETS: 'on', ...env}, input, output,
    prepareLaunch: launch => { launches.push(launch); return launch; }, diagnostics: line => diagnostics.push(line), ...options});
  t.after(async () => { input.end(); await exit; });
  let id = 0;
  const request = async (method, params = {}) => {
    const n = ++id;
    input.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n');
    for (let i = 0; i < 600; i++) { const f = frames.find(m => m.id === n); if (f) return f; await tick(25); }
    throw new Error(`no reply to ${method}; diagnostics: ${diagnostics.join('\n')}`);
  };
  return {
    launches, diagnostics, exit, frames, request,
    call: (name, args = {}) => request('tools/call', {name, arguments: args}),
    notify: method => input.write(JSON.stringify({jsonrpc: '2.0', method}) + '\n'),
    end: () => { input.end(); return exit; },
  };
}

test('the first connection launches at its handshake and records it; a later one answers it and tools/list with no launch, launches once at its first js and never again', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const cold = served(t, home);
  const coldInit = await cold.request('initialize', INIT);
  assert.equal(cold.launches.length, 1, 'with no record the handshake launches, as before');
  const coldTools = await cold.request('tools/list');
  assert.equal(await cold.end(), 0);
  assert.deepEqual(readdirSync(recordDir(home)), ['computer@2025-06-18.json']);
  const coldRuntimeLog = runtimeLog(home);

  const warm = served(t, home);
  const init = await warm.request('initialize', INIT);
  warm.notify('notifications/initialized');
  assert.deepEqual(init, coldInit, 'the recorded handshake answers as the runtime did, host notes included');
  assert.match(init.result.instructions, /Host notes:/);
  assert.deepEqual(await warm.request('tools/list'), coldTools);
  assert.deepEqual((await warm.request('ping')).result, {});
  assert.equal((await warm.call('secrets_list')).result.structuredContent.status, 'ok');
  assert.deepEqual((await warm.call('devices_list')).result.structuredContent.devices.map(d => d.name), ['local']);
  assert.deepEqual((await warm.call('end_task')).result.structuredContent, {status: 'noop', ended: false});
  assert.equal(warm.launches.length, 0, 'nothing so far needed the runtime');
  assert.deepEqual(runtimeLog(home), coldRuntimeLog, 'no new runtime start or traffic was logged after the cold connection');

  const first = await warm.call('js', {code: 'hello'});
  assert.equal(warm.launches.length, 1);
  assert.equal(JSON.parse(textOf(first)).code, 'hello', 'the first js answers as it always did');
  const received = runtimeLog(home).filter(e => e.received).map(e => e.received);
  assert.deepEqual(received[0].params, INIT, 'the runtime is opened with the client\'s own initialize params');
  assert.deepEqual(received.map(m => m.method), ['initialize', 'notifications/initialized', 'tools/call'], 'one handshake, then the call; the client\'s initialized is not repeated');
  const second = await warm.call('js', {code: 'again'});
  assert.equal(JSON.parse(textOf(second)).code, 'again');
  assert.equal((await warm.call('end_task')).result.structuredContent.status, 'ended');
  assert.deepEqual((await warm.request('tools/list')).result, coldTools.result, 'the tool list stays the recorded one');
  assert.equal(warm.launches.length, 1, 'the runtime stays for the connection');
  assert.equal(await warm.end(), 0, warm.diagnostics.join('\n'));
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('profiles_list\'s registry part launches nothing; its live check makes only the listing\'s own launch', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const userData = chromeUserData({userHome: join(home, 'user'), env: {}});
  const extension = join(userData, 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  const env = {CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SANDBOX: 'disabled'};
  handshakeRecords({dir: recordDir(home), surfaces: ['browser']}).write(INIT.protocolVersion, {initialize: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'recorded', version: '0'}}, tools: {tools: []}});
  const listings = [];
  const listBackends = async () => { listings.push(1); return {backends: [{instanceId: 'inst-a', family: 'chrome'}], teardown: {confirmed: true, steps: ['eof']}}; };
  const server = served(t, home, {env, chrome: chromeFacts({userData}), listBackends});
  await server.request('initialize', INIT);
  assert.deepEqual((await server.call('profiles_list')).result.structuredContent, {status: 'ok', profiles: []});
  assert.equal(listings.length, 0, 'an empty registry needs no live check');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}}}));
  assert.deepEqual((await server.call('profiles_list')).result.structuredContent.profiles, [{key: 'personal', ready: true, extensionInstanceId: 'inst-a'}]);
  assert.equal(listings.length, 1);
  assert.equal(server.launches.length, 0, 'the connection\'s own runtime never launched');
  assert.equal(await server.end(), 0);
});

// A real `cua serve` with the handshake recorded: closing it before any call needed the runtime, by EOF or by signal.
function child(home) {
  const proc = spawn(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'serve'], {env: {...process.env, CUA_HOME: home, HOME: join(home, 'user'), CUA_SHIM_SECRETS: 'off'}, stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d; });
  const frames = [];
  createInterface({input: proc.stdout}).on('line', line => frames.push(JSON.parse(line)));
  const exit = new Promise(resolve => proc.on('exit', (code, signal) => resolve({code, signal})));
  let id = 0;
  const request = async (method, params = {}) => {
    const n = ++id;
    proc.stdin.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n');
    for (let i = 0; i < 400; i++) { const f = frames.find(m => m.id === n); if (f) return f; await tick(25); }
    throw new Error(`no reply to ${method}; stderr: ${stderr}`);
  };
  return {proc, exit, request, get stderr() { return stderr; }};
}

for (const how of ['eof', 'SIGTERM', 'SIGINT', 'SIGHUP']) {
  test(`a connection that never launched closes clean on ${how}: exit 0, nothing launched, nothing left`, {skip: !supported}, async t => {
    const home = fakeInstalledHome(t);
    handshakeRecords({dir: recordDir(home), surfaces: ['computer']}).write(INIT.protocolVersion, {
      initialize: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'recorded', version: '0'}, instructions: 'Recorded.'},
      tools: {tools: [{name: 'js', description: 'Recorded js.', inputSchema: {type: 'object'}}, {name: 'js_reset', description: 'Recorded reset.', inputSchema: {type: 'object'}}]},
    });
    const server = child(home);
    const init = await server.request('initialize', INIT);
    assert.equal(init.result.serverInfo.name, 'recorded');
    assert.deepEqual((await server.request('tools/list')).result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list', 'devices_list', 'devices_use']);
    assert.equal((await server.request('tools/call', {name: 'end_task', arguments: {}})).result.structuredContent.status, 'noop');
    if (how === 'eof') server.proc.stdin.end(); else server.proc.kill(how);
    assert.deepEqual(await server.exit, {code: 0, signal: null}, server.stderr);
    assert.equal(server.stderr, '', 'no teardown or leftover is reported');
    assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false, 'no runtime was launched');
    assert.deepEqual(readdirSync(join(home, 'run')), []);
  });
}

// The record holds the runtime's own answers only; cua's serve-time additions (host notes, its own tools, the MAWS rule
// in profiles_list) are applied on top at every connection, so sessions configured differently share one record.
test('the record is the runtime\'s raw answers; a MAWS session and a plain one replaying it each get their own descriptions', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const env = {CUA_SHIM_SURFACES: 'computer,browser', CUA_SHIM_SECRETS: 'off'};
  const plain = served(t, home, {env});
  await plain.request('initialize', INIT);
  const plainTools = (await plain.request('tools/list')).result.tools;
  assert.equal(await plain.end(), 0);
  const record = JSON.parse(readFileSync(join(recordDir(home), 'computer,browser@2025-06-18.json'), 'utf8'));
  assert.deepEqual(record.tools.tools.map(tool => tool.name), ['js', 'js_add_node_module_dir', 'js_reset', 'turn_ended'], 'the runtime\'s list, none of cua\'s tools');
  assert.equal(JSON.stringify(record).includes('Host notes'), false, 'no host notes in the record');
  assert.equal(JSON.stringify(record).includes('Host rules (cua)'), false, 'no js rules in the record');

  const maws = served(t, home, {env: {...env, CUA_BROWSER_BACKENDS: join(home, 'nothing-listens.sock'), CUA_SHIM_HOST_NOTES: 'Replaced notes.'}});
  const init = await maws.request('initialize', INIT);
  const mawsTools = (await maws.request('tools/list')).result.tools;
  assert.equal(maws.launches.length, 0, 'replayed from the record');
  assert.match(init.result.instructions, /Replaced notes\.$/, 'this connection\'s host notes');
  const profiles = tools => tools.find(tool => tool.name === 'profiles_list').description;
  assert.match(profiles(mawsTools), /In MAWS: cua\.getBrowser\(\) with no id is this session's in-app browser/);
  assert.doesNotMatch(profiles(plainTools), /In MAWS/);
  assert.deepEqual(mawsTools.map(tool => tool.name), plainTools.map(tool => tool.name));
  assert.equal(await maws.end(), 0, maws.diagnostics.join('\n'));
});

// MAWS (src/chrome/client-mode.mjs): the socket is dialled at once; launches and readiness listings wait for its hello.
test('with a MAWS backend the handshake does not wait for its hello; profiles_list and the first launch do, and prefer its instance', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const path = join(home, 'maws.sock');
  const instanceId = 'maws:lazy';
  const ports = [];
  const peer = createNetServer(socket => {
    socket.on('error', () => {});
    const ext = createFakeMawsExtension({instanceId});
    ports.push({ext, port: ext.connect({toHost: socket, fromHost: socket, sendHello: false})});
  });
  await new Promise(resolve => peer.listen(path, resolve));
  t.after(() => new Promise(resolve => { peer.close(resolve); for (const {port} of ports) port.disconnect(); }));
  handshakeRecords({dir: recordDir(home), surfaces: ['computer', 'browser']}).write(INIT.protocolVersion, {initialize: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'recorded', version: '0'}}, tools: {tools: []}});
  const server = served(t, home, {env: {CUA_SHIM_SURFACES: 'computer,browser', CUA_BROWSER_BACKENDS: path, CUA_SHIM_SECRETS: 'off'}});
  const began = Date.now();
  await server.request('initialize', INIT);
  assert.ok(Date.now() - began < 2000, 'the handshake is answered without the hello');
  for (let i = 0; i < 200 && !ports.length; i++) await tick(10);
  assert.equal(ports.length, 1, 'the backend socket was dialled at once');
  const profiles = server.call('profiles_list');
  const js = server.call('js', {code: 'hello'});
  await tick(300);
  assert.equal(server.launches.length, 0, 'the launch waits for the hello');
  ports[0].port.peer.notify('hello', ports[0].ext.hello());
  await js;
  assert.deepEqual((await profiles).result.structuredContent.profiles, [{key: 'maws', ready: true, extensionInstanceId: instanceId}], 'a listing requested before the hello reports its ready instance');
  assert.equal(server.launches.length, 1);
  assert.equal(server.launches[0].env.BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID, instanceId);
  assert.equal(await server.end(), 0, server.diagnostics.join('\n'));
});

// lazyRuntime under createServer with an in-process fake runtime: the paths a real launch rarely takes.
function lazyHarness({start, record = null}) {
  const writes = [];
  const diagnostics = [];
  const records = {read: () => record, write: (version, value) => writes.push({version, value})};
  const h = harness({upstream: lazyRuntime({start, records, diagnostics: line => diagnostics.push(line)}), server: {diagnostics: line => diagnostics.push(line)}});
  return {...h, writes, diagnostics};
}
const RECORD = {initialize: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'recorded', version: '0'}, instructions: 'Recorded.'}, tools: {tools: [{name: 'js', description: 'Recorded.', inputSchema: {type: 'object'}}]}};

test('before a launch: ping is answered, any other request is method-not-found, notifications are dropped, and close confirms with nothing to stop', async () => {
  let starts = 0;
  const h = lazyHarness({start: async () => { starts++; return fakeUpstream(); }, record: RECORD});
  assert.equal((await h.client.request('initialize', INIT).response).result.serverInfo.name, 'recorded');
  assert.deepEqual((await h.client.request('ping').response).result, {});
  assert.equal((await h.client.request('resources/list').response).error.code, -32601);
  h.client.notify('notifications/cancelled', {requestId: 99});
  h.client.eof();
  const closed = await h.server.closed;
  assert.equal(closed.code, 0);
  assert.deepEqual(closed.teardown, {confirmed: true, steps: []});
  assert.equal(starts, 0);
});

test('a launch that fails answers the waiting call with its reason and fails the connection', async () => {
  const h = lazyHarness({start: async () => { throw Object.assign(new Error('the launch broke'), {code: 'launch_broke'}); }, record: RECORD});
  await h.client.request('initialize', INIT).response;
  const js = await h.client.call('js', {code: 'x'}).response;
  assert.match(js.error.message, /^cua: the runtime could not be started \(launch_broke\): the launch broke$/);
  const closed = await h.server.closed;
  assert.equal(closed.code, 1);
  assert.ok(h.diagnostics.some(line => /could not be started \(launch_broke\)/.test(line)), h.diagnostics.join('\n'));
});

test('a runtime that exits before start resolves answers the waiting call with runtime_exited and fails the connection', async t => {
  const runtime = fakeUpstream();
  const h = lazyHarness({record: RECORD, start: async () => {
    // The spawn error was already reported before lazyRuntime could attach its exit handler.
    runtime.exit({code: null, signal: null, error: 'ENOENT: the runtime anchor could not be spawned'});
    runtime.send = () => false;
    return runtime;
  }});
  t.after(async () => { h.client.eof(); await h.server.closed; });
  await h.client.request('initialize', INIT).response;
  const js = await h.client.call('js', {code: 'x'}).response;
  assert.match(js.error.message, /the runtime could not be started \(runtime_exited\):/);
  const closed = await h.server.closed;
  assert.equal(closed.code, 1);
  assert.ok(h.diagnostics.some(line => /could not be started \(runtime_exited\)/.test(line)), h.diagnostics.join('\n'));
});

test('a close while a launch waits before spawning abandons it: nothing spawned, the call answered connection_closing', async () => {
  let spawned = 0;
  const h = lazyHarness({record: RECORD, start: ({signal}) => new Promise(resolve => signal.addEventListener('abort', () => resolve(null)))
    .then(result => { if (result) spawned++; return result; })});
  await h.client.request('initialize', INIT).response;
  const js = h.client.call('js', {code: 'x'}).response;
  await tick(20);
  h.client.eof();
  const closed = await h.server.closed;
  assert.equal(closed.code, 0, h.diagnostics.join('\n'));
  assert.deepEqual(closed.teardown, {confirmed: true, steps: []});
  assert.equal(spawned, 0);
  assert.match((await js).error.message, /^cua: connection_closing: the runtime was not started$/);
});

test('without a record the handshake launches and records the runtime\'s answers', async () => {
  const runtime = fakeUpstream();
  const h = lazyHarness({start: async () => runtime});
  const init = h.client.request('initialize', INIT);
  const opened = await runtime.nextRequest('initialize');
  assert.deepEqual(opened.params, INIT);
  runtime.reply(opened, RECORD.initialize);
  assert.equal((await init.response).result.serverInfo.name, 'recorded');
  await runtime.next(m => m.method === 'notifications/initialized');
  h.client.notify('notifications/initialized', {});
  const list = h.client.request('tools/list');
  runtime.reply(await runtime.nextRequest('tools/list'), RECORD.tools);
  await list.response;
  assert.deepEqual(h.writes, [{version: '2025-06-18', value: RECORD}]);
  assert.equal(runtime.sent.filter(m => m.method === 'notifications/initialized').length, 1);
  h.client.eof();
  assert.equal((await h.server.closed).code, 0);
});
