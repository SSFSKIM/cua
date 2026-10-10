// The lazy runtime (issue #105): `cua serve` answers the MCP handshake and the tool list with no vendor runtime, once
// the release's handshake is recorded, and launches the runtime on the first call that needs it; calls that need none
// never start one, and a connection that never launched closes clean. Served in process with a counting
// `prepareLaunch` (one call per launch) against a scratch CUA_HOME whose "installed" release runs the fake upstream
// (test/fixtures/installed-home.mjs), and as real `cua serve` processes for the signal paths.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {createServer as createNetServer} from 'node:net';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {PassThrough} from 'node:stream';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';
import {fakeUpstream, harness, textOf, tick} from './fixtures/mcp-harness.mjs';
import {serve, settingsFrom} from '../src/mcp/server.mjs';
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

// ---- the idle stop (issue #107) ----

// A fake clock for createServer's idle timer: timers are recorded and fire only when the test says so.
function fakeClock() {
  const timers = [];
  return {
    timers,
    timer: (fn, ms) => {
      const entry = {fn, ms, live: true};
      timers.push(entry);
      return () => { entry.live = false; };
    },
    pending: () => timers.filter(entry => entry.live),
    fire() {
      const [entry, ...more] = timers.filter(e => e.live);
      assert.ok(entry && !more.length, `exactly one idle timer is pending (${timers.filter(e => e.live).length})`);
      entry.live = false;
      entry.fn();
    },
  };
}
const until = async (what, predicate) => {
  for (let i = 0; i < 400; i++) { if (predicate()) return; await tick(10); }
  throw new Error(`timed out waiting for ${what}`);
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('an idle runtime stops after the default 15 min through the normal end and the next js relaunches it once, its result opening with the restart notice', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  handshakeRecords({dir: recordDir(home), surfaces: ['computer']}).write(INIT.protocolVersion, {initialize: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'recorded', version: '0'}}, tools: {tools: []}});
  const clock = fakeClock();
  const server = served(t, home, {env: {CUA_RUNTIME_IDLE_MS: undefined}, idleTimer: clock.timer});
  await server.request('initialize', INIT);
  assert.equal((await server.call('end_task')).result.structuredContent.status, 'noop');
  assert.equal(clock.timers.length, 0, 'with no runtime running nothing arms');

  await server.call('js', {code: 'approve'});
  assert.equal(server.launches.length, 1);
  assert.deepEqual(clock.pending().map(e => e.ms), [15 * 60_000], 'armed once the call completed, at the default');
  const [session] = readdirSync(join(home, 'run')).filter(name => name.endsWith('.pid')).map(name => name.slice(0, -4));
  const approval = join(server.launches[0].env.CODEX_HOME, 'computer-use', 'sessions', `${session}.toml`);
  assert.ok(existsSync(approval));

  clock.fire();
  await until('the idle stop', () => server.diagnostics.includes('runtime stopped after 15 min idle'));
  assert.deepEqual(server.diagnostics, ['runtime stopped after 15 min idle'], 'one line, no teardown trouble');
  const first = runtimeLog(home);
  assert.deepEqual(first.filter(e => e.received?.method === 'tools/call').map(e => e.received.params.name), ['js', 'turn_ended'], 'the open task was completed before the teardown');
  assert.equal(alive(first[0].start.pid), false, 'the runtime is gone');
  assert.deepEqual(readdirSync(join(home, 'run')), [`${session}.pid`], 'its working directory is gone; the connection keeps its record');
  assert.ok(existsSync(approval), 'the connection\'s app approvals stay with it');
  assert.equal(clock.pending().length, 0);

  assert.deepEqual((await server.call('end_task')).result.structuredContent, {status: 'noop', ended: false}, 'the stop ended the task');
  assert.equal(server.launches.length, 1, 'a no-op end_task launches nothing');
  const again = await server.call('js', {code: 'again'});
  assert.equal(server.launches.length, 2, 'one relaunch');
  assert.match(again.result.content[0].text, /^cua: the runtime was stopped after 15 min without a tool call and has restarted for this call\. Its REPL state is gone \(variables, app handles, browser tabs/);
  assert.equal(JSON.parse(again.result.content[1].text).code, 'again', 'then the fresh runtime\'s own result');
  assert.notEqual(runtimeLog(home)[0].start.pid, first[0].start.pid);
  assert.equal((await server.call('js', {code: 'third'})).result.content.length, 1, 'only the first call after the restart carries the notice');
  assert.equal(await server.end(), 0, server.diagnostics.join('\n'));
  assert.deepEqual(readdirSync(join(home, 'run')), []);
  assert.equal(existsSync(approval), false);
});

test('an idle restart reuses a leftover working directory, fixes its mode and removes it at close', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const clock = fakeClock();
  const server = served(t, home, {env: {CUA_RUNTIME_IDLE_MS: '60000'}, idleTimer: clock.timer});
  await server.request('initialize', INIT);
  await server.call('js', {code: 'first'});
  const cwd = server.launches[0].cwd;
  clock.fire();
  await until('the idle stop', () => server.diagnostics.includes('runtime stopped after 1 min idle'));

  // The residue of a failed idle cleanup (issue #107): the directory and its files still exist at the next launch.
  mkdirSync(cwd);
  chmodSync(cwd, 0o777);
  const residue = join(cwd, 'leftover');
  writeFileSync(residue, 'leftover');
  const again = await server.call('js', {code: 'again'});
  assert.equal(again.error, undefined, server.diagnostics.join('\n'));
  assert.equal(again.result.isError, false, server.diagnostics.join('\n'));
  assert.equal(JSON.parse(again.result.content.at(-1).text).code, 'again');
  assert.equal(server.launches.length, 2);
  assert.equal(server.launches[1].cwd, cwd, 'the connection reuses its own working directory');
  assert.equal(readFileSync(residue, 'utf8'), 'leftover');
  assert.equal(statSync(cwd).mode & 0o777, 0o700, 'the existing directory is private again');
  assert.equal(await server.end(), 0, server.diagnostics.join('\n'));
  assert.equal(existsSync(cwd), false, 'close removes the reused directory and its residue');
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('CUA_RUNTIME_IDLE_MS: 0 never stops the runtime; a value must be whole milliseconds', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const clock = fakeClock();
  const server = served(t, home, {env: {CUA_RUNTIME_IDLE_MS: '0'}, idleTimer: clock.timer});
  await server.request('initialize', INIT);
  await server.call('js', {code: 'hello'});
  await server.call('end_task');
  assert.equal(clock.timers.length, 0);
  assert.equal(await server.end(), 0);
  assert.equal(settingsFrom({}).runtimeIdleMs, 15 * 60_000);
  assert.equal(settingsFrom({CUA_RUNTIME_IDLE_MS: '90000'}).runtimeIdleMs, 90_000);
  assert.equal(settingsFrom({CUA_RUNTIME_IDLE_MS: '2147483647'}).runtimeIdleMs, 2_147_483_647);
  assert.throws(() => settingsFrom({CUA_RUNTIME_IDLE_MS: '2147483648'}), {code: 'invalid_setting', message: /2147483647.*24\.8 days/});
  for (const bad of ['', 'soon', '-1', '1.5', '15m']) assert.throws(() => settingsFrom({CUA_RUNTIME_IDLE_MS: bad}), {code: 'invalid_setting'}, bad);
});

// In process: a lazyRuntime whose every launch is a fake runtime the test answers (the handshake by itself).
function idleHarness({record = RECORD, runtimeIdleMs = 60_000, profiles, devices} = {}) {
  const clock = fakeClock();
  const runtimes = [];
  let stops = 0;
  const start = async () => {
    const runtime = fakeUpstream();
    const send = runtime.send;
    runtime.send = msg => { send(msg); if (msg.method === 'initialize') queueMicrotask(() => runtime.reply(msg, record.initialize)); };
    runtimes.push(runtime);
    return runtime;
  };
  const diagnostics = [];
  const upstream = lazyRuntime({start, records: {read: () => record, write: () => {}}, stopped: () => { stops++; }, diagnostics: line => diagnostics.push(line)});
  const h = harness({upstream, server: {runtimeIdleMs, devices, idleTimer: clock.timer, diagnostics: line => diagnostics.push(line),
    ...(profiles ? {profiles, surfaces: ['computer', 'browser']} : {})}});
  return {...h, clock, runtimes, diagnostics, stops: () => stops};
}
const answer = async (runtime, name, text) => runtime.text(await runtime.nextCall(name), text);

test('the idle timer arms only when no call is running and the next call clears it; profiles_list\'s live check counts as a call', async t => {
  let listed;
  const h = idleHarness({profiles: {list: ({track}) => track(new Promise(resolve => { listed = resolve; })).then(() => [])}});
  t.after(async () => { h.client.eof(); await h.server.closed; });
  await h.client.request('initialize', INIT).response;
  const js = h.client.call('js', {code: 'a'});
  await until('the launch', () => h.runtimes.length === 1);
  const [runtime] = h.runtimes;
  assert.deepEqual(h.clock.timers, [], 'a running call is never idle');
  await answer(runtime, 'js', 'a');
  await js.response;
  assert.deepEqual(h.clock.pending().map(e => e.ms), [60_000]);

  const second = h.client.call('js', {code: 'b'});
  await until('the second call upstream', () => runtime.calls('js').length === 2);
  assert.equal(h.clock.pending().length, 0, 'the next call cleared it');
  runtime.text(runtime.calls('js')[1], 'b');
  await second.response;
  assert.equal(h.clock.pending().length, 1, 're-armed after it');

  const profiles = h.client.call('profiles_list');
  await tick(10);
  assert.equal(h.clock.pending().length, 0, 'a live check under way is not idle');
  listed();
  await profiles.response;
  assert.equal(h.clock.pending().length, 1);
  assert.equal(h.runtimes.length, 1);
});

test('a call that races the idle stop, during its completion or its teardown, waits and runs on a fresh runtime; the dying one is never heard from', async t => {
  const h = idleHarness();
  t.after(async () => { h.client.eof(); await h.server.closed; });
  await h.client.request('initialize', INIT).response;
  const js = h.client.call('js', {code: 'first'});
  await until('the launch', () => h.runtimes.length === 1);
  const [dying] = h.runtimes;
  await answer(dying, 'js', 'first');
  await js.response;
  const release = dying.holdTeardown();

  h.clock.fire();
  const completion = await dying.nextCall('turn_ended');
  const duringCompletion = h.client.call('js', {code: 'during completion'});
  dying.text(completion, '{}');
  await until('the teardown', () => dying.terminations.length === 1);
  const duringTeardown = h.client.call('js_reset');
  dying.emit({jsonrpc: '2.0', id: 'late', method: 'elicitation/create', params: {}});
  dying.exit({code: 0, signal: null});
  await tick(20);
  assert.equal(h.runtimes.length, 1, 'no launch while the old runtime is stopping');
  assert.equal(dying.calls('js').length, 1, 'the dying runtime got no new work');
  assert.equal(h.client.responsesFor(duringCompletion.id).length + h.client.responsesFor(duringTeardown.id).length, 0, 'both wait');

  release();
  await until('the relaunch', () => h.runtimes.length === 2);
  const fresh = h.runtimes[1];
  await answer(fresh, 'js', 'fresh');
  const first = await duringCompletion.response;
  assert.match(textOf(first), /^cua: the runtime was stopped after 1 min without a tool call and has restarted for this call\.[^\n]*\nfresh$/);
  fresh.text(await fresh.nextCall('js_reset'), 'reset');
  assert.equal(textOf(await duringTeardown.response), 'reset', 'the notice goes once');
  assert.equal(h.client.frames.some(m => m.id === 'late'), false, 'the dying runtime\'s request never reached the client');
  assert.equal(h.server.state, 'active', 'the connection stays, a new task open');
  assert.equal(h.stops(), 1);
  assert.deepEqual(h.diagnostics, ['runtime stopped after 1 min idle']);
  assert.deepEqual(dying.terminations, [{budgetMs: 150}]);
});

test('a held js/js_reset blocks devices_use during idle teardown; a held end_task alone does not', async t => {
  for (const name of ['js', 'js_reset', 'end_task']) await t.test(name, async t => {
    let opens = 0;
    const devices = {open: async device => {
      assert.equal(device, 'other');
      opens++;
      return {initializeResult: {}, request: async () => ({result: {tools: []}}), close: async () => {}};
    }};
    const h = idleHarness({devices});
    let release;
    t.after(async () => { release?.(); h.client.eof(); await h.server.closed; });
    await h.client.request('initialize', INIT).response;
    const first = h.client.call('js', {code: 'first'});
    await until('the launch', () => h.runtimes.length === 1);
    const [dying] = h.runtimes;
    await answer(dying, 'js', 'first');
    await first.response;
    release = dying.holdTeardown();
    h.clock.fire();
    await answer(dying, 'turn_ended', '{}');
    await until('the teardown', () => dying.terminations.length === 1);
    assert.equal(h.server.state, 'idle', 'the previous task is complete while teardown waits');

    const held = h.client.call(name, name === 'js' ? {code: 'held'} : {});
    const switched = await h.client.call('devices_use', {device: 'other'}).response;
    if (name === 'end_task') {
      assert.equal(switched.result.structuredContent.status, 'ok');
      assert.equal(opens, 1, 'an end_task alone does not keep the local task open');
    } else {
      assert.equal(switched.result.structuredContent.code, 'task_open');
      assert.equal(opens, 0, 'the target stays local while work is held');
    }
    assert.equal(h.client.responsesFor(held.id).length, 0, 'the held call is still waiting for teardown');
    release();
    if (name === 'end_task') {
      assert.deepEqual((await held.response).result.structuredContent, {status: 'noop', ended: false});
      assert.equal(h.runtimes.length, 1, 'no new runtime for a held end_task');
    } else {
      await until('the relaunch', () => h.runtimes.length === 2);
      await answer(h.runtimes[1], name, 'local');
      assert.match(textOf(await held.response), /\nlocal$/);
      const end = h.client.call('end_task');
      await answer(h.runtimes[1], 'turn_ended', '{}');
      await end.response;
    }
  });
});

test('a close during the idle stop refuses the call it held and confirms; an unconfirmed idle teardown makes the close code 1', async () => {
  const h = idleHarness();
  await h.client.request('initialize', INIT).response;
  const js = h.client.call('js', {code: 'x'});
  await until('the launch', () => h.runtimes.length === 1);
  const [dying] = h.runtimes;
  await answer(dying, 'js', 'x');
  await js.response;
  const release = dying.holdTeardown({confirmed: false, steps: ['eof', 'SIGTERM', 'SIGKILL'], reason: 'group still lists 1 process(es)'});
  h.clock.fire();
  await answer(dying, 'turn_ended', '{}');
  await until('the teardown', () => dying.terminations.length === 1);
  const held = h.client.call('js', {code: 'held'});
  h.client.eof();
  await tick(20);
  release();
  const closed = await h.server.closed;
  assert.match(textOf(await held.response), /connection_closing/);
  assert.equal(h.runtimes.length, 1, 'nothing relaunched for a closing connection');
  assert.equal(closed.code, 1);
  assert.ok(h.diagnostics.some(line => /^idle runtime teardown unconfirmed after eof, SIGTERM, SIGKILL: group still lists 1 process/.test(line)), h.diagnostics.join('\n'));
});
