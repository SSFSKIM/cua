// The engine client of cua's own macOS engine service (src/services/engine/client.mjs; docs/doperpowers/specs/2026-10-18-
// own-native-engine-design.md, Design "The service", Client; Interfaces, EngineClient): the ping with its version and
// build check and the `cua install --engine` diagnostic, the launch through LaunchServices on a failed connect and the
// 5 s reconnect, the diagnostic that points at the unified log when the engine never comes up, one request in flight,
// the 120 s deadline, the suspended cell budget, and the engine's errors as the vendor's classes. Against a fake engine
// on a Unix socket (test/helpers/fake-engine.mjs) and, where a Swift toolchain exists, the debug engine run directly under
// CUA_ENGINE_SOCKET on requests that raise no permission prompt (ping, status, list_apps) and launched by the client
// itself through a stand-in for the relay.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {EngineFailure, NO_REPLY, frame, nativePipe, startFakeEngine} from './helpers/fake-engine.mjs';
import {debugEngine, engineSkip, engineVersionFromSource, startEngine} from './helpers/engine-wire.mjs';
import {infoPlist} from '../scripts/spike/engine/assemble.mjs';
import {MAX_FRAME, SkyComputerUseError, SkyComputerUseTransportError} from '../src/services/engine/protocol.mjs';
import {DEFAULT_DEADLINE_MS, bundleIdentity, createEngineClient, socketPathFor} from '../src/services/engine/client.mjs';

const IDENTITY = {engineVersion: '0.1.0', build: 'b1'};

function scratchDir(t) {
  const s = shortScratch('cua-ecl-');
  t.after(s.cleanup);
  return s.dir;
}

// A trusted worker's nodeRepl as the client uses it: the relay's native pipe, the LaunchServices relay (recording each
// launch and running `launch(target)`), and the budget suspension (its depth readable while a request runs).
function workerRepl({launch = async () => {}} = {}) {
  const launches = [];
  const budget = {depth: 0, suspensions: 0};
  const nodeRepl = {
    nativePipe: nativePipe(),
    launchServices: {openApplication: async target => { launches.push(target); await launch(target); }},
    withSuspendedTimeout: async fn => { budget.depth++; budget.suspensions++; try { return await fn(); } finally { budget.depth--; } },
  };
  return {nodeRepl, launches, budget};
}

function clientFor(socket, {expected = IDENTITY, launch, ...options} = {}) {
  const {nodeRepl, launches, budget} = workerRepl({launch});
  const client = createEngineClient({nodeRepl, appPath: '/Applications/Fake Engine.app', socketPath: socket, expected, firstConnectMs: 150, launchWaitMs: 1500, ...options});
  return {client, launches, budget, nodeRepl};
}

test('the socket is engine.sock beside the bundle, and the bundle\'s version and build come from its Info.plist', t => {
  const dir = scratchDir(t);
  const app = join(dir, 'cua Engine.app');
  assert.equal(socketPathFor(app), join(dir, 'engine.sock'));
  mkdirSync(join(app, 'Contents'), {recursive: true});
  writeFileSync(join(app, 'Contents', 'Info.plist'), infoPlist({version: '0.1.0', build: 'abc123'}));
  assert.deepEqual(bundleIdentity(app), {engineVersion: '0.1.0', build: 'abc123'});
  assert.throws(() => bundleIdentity(join(dir, 'missing.app')), /Info\.plist/);
  assert.equal(DEFAULT_DEADLINE_MS, 120_000);
});

test('connect pings with cua-engine-1, accepts an engine whose version and build match the bundle, and reuses the live connection', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket);
  const {client, launches} = clientFor(socket);
  t.after(() => client.close());
  assert.deepEqual(await client.connect(), {serverApiVersion: 'cua-engine-1', ...IDENTITY});
  assert.deepEqual(client.identity, {serverApiVersion: 'cua-engine-1', ...IDENTITY});
  assert.deepEqual(engine.received.map(r => [r.method, r.params]), [['ping', {clientApiVersion: 'cua-engine-1'}]]);
  assert.equal(launches.length, 0);
  await client.connect();
  assert.equal(engine.received.length, 1, 'a live connection is reused');
});

test('a connection opened late in the first window gets its own full ping wait, so a slow ping to a healthy engine launches nothing', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {ping: async () => { await new Promise(resolve => setTimeout(resolve, 80)); return {serverApiVersion: 'cua-engine-1', ...IDENTITY}; }}});
  const {client, launches, nodeRepl} = clientFor(socket);
  t.after(() => client.close());
  // The relay opens the socket only 130 ms into the 150 ms window, leaving the ping 20 ms of it.
  const open = nodeRepl.nativePipe.createConnection.bind(nodeRepl.nativePipe);
  nodeRepl.nativePipe.createConnection = async path => { await new Promise(resolve => setTimeout(resolve, 130)); return open(path); };
  assert.deepEqual(await client.connect(), {serverApiVersion: 'cua-engine-1', ...IDENTITY});
  assert.equal(launches.length, 0, 'the healthy engine is not launched over');
  assert.deepEqual(engine.received.map(r => r.method), ['ping']);
});

test('a build or version mismatch fails at once with the diagnostic naming cua install --engine, never launching, retrying or stopping that engine', async t => {
  for (const identity of [{engineVersion: '0.1.0', build: 'other'}, {engineVersion: '9.9.9', build: 'b1'}]) {
    const socket = join(scratchDir(t), 'engine.sock');
    const engine = await startFakeEngine(t, socket, {identity, handlers: {shutdown: () => assert.fail('a service never stops an engine it did not launch')}});
    const {client, launches} = clientFor(socket);
    t.after(() => client.close());
    await assert.rejects(client.connect(), error => error instanceof SkyComputerUseTransportError
      && error.message.includes('cua install --engine') && error.message.includes(`version ${identity.engineVersion} build ${identity.build}`)
      && error.message.includes('version 0.1.0 build b1') && error.message.includes('left running'));
    assert.deepEqual(engine.received.map(r => r.method), ['ping'], 'one ping, no retry');
    assert.equal(launches.length, 0);
  }
});

test('an engine speaking another API version, or refusing the client\'s, fails at once naming cua install --engine', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {ping: () => ({serverApiVersion: 'cua-engine-2', ...IDENTITY})}});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.connect(), error => error instanceof SkyComputerUseTransportError
    && /API version mismatch: client=cua-engine-1 server=cua-engine-2/.test(error.message) && error.message.includes('cua install --engine'));
  assert.equal(engine.received.length, 1);

  const socket2 = join(scratchDir(t), 'engine.sock');
  const engine2 = await startFakeEngine(t, socket2, {handlers: {ping: () => { throw new EngineFailure(-10013, 'The client speaks x', 'incompatibleClientVersion'); }}});
  const {client: client2} = clientFor(socket2);
  t.after(() => client2.close());
  await assert.rejects(client2.connect(), error => error instanceof SkyComputerUseError && error.errorName === 'incompatibleClientVersion');
  assert.equal(engine2.received.length, 1);
});

test('a failed connect launches the bundle through LaunchServices, under the suspended budget, and reconnects until the engine answers', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let engine;
  let depthAtLaunch;
  const {client, launches, budget} = clientFor(socket, {launch: () => {
    depthAtLaunch = budget.depth;
    setTimeout(async () => { engine = await startFakeEngine(t, socket); }, 200);
  }});
  t.after(() => client.close());
  assert.equal((await client.connect()).build, 'b1');
  assert.deepEqual(launches, [{applicationPath: '/Applications/Fake Engine.app'}]);
  assert.equal(depthAtLaunch, 1, 'the launch wait does not spend the cell\'s budget');
  assert.equal(budget.depth, 0);
  assert.deepEqual(engine.received.map(r => r.method), ['ping']);
});

test('an engine that never comes up fails with a diagnostic pointing at the unified log, where its own refusal to start lands', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const {client, launches} = clientFor(socket, {launchWaitMs: 300});
  const started = Date.now();
  await assert.rejects(client.connect(), error => error instanceof SkyComputerUseTransportError
    && error.message.startsWith('cua engine did not start: nothing answered at ')
    && error.message.includes('within 300 ms of launching /Applications/Fake Engine.app')
    && error.message.includes('log show') && error.message.includes('subsystem == "io.github.ssfskim.cua.engine"')
    && error.message.includes('peerPolicy') && error.cause instanceof Error);
  assert.equal(launches.length, 1);
  assert.ok(Date.now() - started >= 300, 'the whole reconnect window was waited');
  const failing = clientFor(socket, {launch: async () => { throw new Error('open exited 1'); }}).client;
  await assert.rejects(failing.connect(), error => error instanceof SkyComputerUseTransportError
    && error.message === 'cua engine launch request failed for /Applications/Fake Engine.app: open exited 1' && error.cause.message === 'open exited 1');
});

test('a worker without the relay\'s native pipe fails with a bounded sentence', async () => {
  const client = createEngineClient({nodeRepl: {withSuspendedTimeout: fn => fn()}, appPath: '/x/cua Engine.app', expected: IDENTITY});
  await assert.rejects(client.connect(), error => error instanceof SkyComputerUseTransportError && /native pipe is unavailable/.test(error.message));
});

test('execute sends the method, its arguments, a deadline 120 s out and the lineage, under the suspended budget, and returns the result with the round trip', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let depthAtEngine;
  const {client, budget} = clientFor(socket);
  t.after(() => client.close());
  const engine = await startFakeEngine(t, socket, {handlers: {
    'execute:get_app_state': () => { depthAtEngine = budget.depth; return {lineage: 'L1'}; },
    'execute:resolve_app': () => { depthAtEngine = budget.depth; return {appPath: '/A.app'}; },
  }});
  const before = Date.now();
  const {result, engineMs} = await client.execute('get_app_state', {app: '/A.app'}, {lineage: 'L1'});
  assert.deepEqual(result, {lineage: 'L1'});
  assert.ok(engineMs >= 0 && engineMs < 5000);
  assert.equal(depthAtEngine, 1, 'an action, a settle or a launch wait never spends the cell\'s budget');
  const [sent] = engine.executes();
  assert.deepEqual([sent.method, sent.args, sent.lineage], ['get_app_state', {app: '/A.app'}, 'L1']);
  assert.ok(sent.deadlineUnixMilliseconds >= before + 120_000 && sent.deadlineUnixMilliseconds <= Date.now() + 120_000);

  await client.execute('resolve_app', {app: 'A'}, {suspend: false});
  assert.equal(depthAtEngine, 0, 'a policy round trip runs on the budget, as the vendor\'s does');
  assert.equal('lineage' in engine.executes()[1], false, 'no lineage is sent when none is given');
});

test('status asks the engine for its identity and grants, a request of its own outside execute', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {status: () => ({accessibility: false, connections: 0})}});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  assert.deepEqual(await client.status(), {accessibility: false, connections: 0});
  assert.deepEqual(engine.received.map(r => r.method), ['ping', 'status']);
});

test('one request in flight: a second waits until the first is answered, and its deadline counts from when it is written', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let answeredFirstAt = 0;
  let answeredFirstWall = 0;
  const engine = await startFakeEngine(t, socket, {handlers: {
    'execute:slow': () => new Promise(resolve => setTimeout(() => { answeredFirstAt = performance.now(); answeredFirstWall = Date.now(); resolve('slow'); }, 120)),
    'execute:fast': () => 'fast',
  }});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  await client.connect();
  const [slow, fast] = await Promise.all([client.execute('slow', {}), client.execute('fast', {})]);
  assert.deepEqual([slow.result, fast.result], ['slow', 'fast']);
  const second = engine.received.find(r => r.params?.method === 'fast');
  assert.ok(second.at >= answeredFirstAt, 'the second request reached the engine only after the first was answered');
  assert.ok(second.params.deadlineUnixMilliseconds >= answeredFirstWall + 120_000, 'the queued request\'s deadline is not shortened by its wait');
});

test('the engine answers its own deadline (timeoutReached) before the client gives up; a request with no answer past the deadline and its grace is a transport error and the next call reconnects', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {
    'execute:settles': ({deadlineUnixMilliseconds}) => new Promise((_, reject) => setTimeout(() => reject(new EngineFailure(-10005, 'timeoutReached', 'timeoutReached')), Math.max(0, deadlineUnixMilliseconds - Date.now()) + 20)),
    'execute:hang': () => NO_REPLY,
    'execute:ok': () => 'ok',
  }});
  const {client} = clientFor(socket, {deadlineGraceMs: 300});
  t.after(() => client.close());
  await assert.rejects(client.execute('settles', {}, {deadlineMs: 80}), error => error instanceof SkyComputerUseError && error.errorName === 'timeoutReached');
  assert.equal(engine.received.filter(r => r.method === 'ping').length, 1, 'the engine\'s own deadline answer keeps the connection and its lineages');
  const started = Date.now();
  await assert.rejects(client.execute('hang', {}, {deadlineMs: 80}), error => error instanceof SkyComputerUseTransportError && error.message === 'cua engine execute timed out');
  assert.ok(Date.now() - started >= 380, 'the client waits the deadline and its grace');
  assert.equal((await client.execute('ok', {})).result, 'ok');
  assert.equal(engine.received.filter(r => r.method === 'ping').length, 2, 'a fresh connection after the timeout');
});

test('engine errors become SkyComputerUseError with the engine\'s errorName and the vendor\'s message envelope; the input meta rides along', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const meta = {inputRoute: null, startedAt: null, endedAt: null, receivedAt: 1, hidIdleMs: 20};
  await startFakeEngine(t, socket, {handlers: {
    'execute:get_app_state': () => { throw new EngineFailure(-10005, 'noWindowsAvailable', 'noWindowsAvailable'); },
    'execute:click': () => { throw new EngineFailure(-10005, 'The menu bar opens through the app\'s keyboard shortcut.', 'menuBarItemUnsupported', {meta}); },
    'execute:weird': () => { throw new EngineFailure(-32602, 'Invalid params: method is required', 'invalidParams'); },
  }});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', {app: 'x'}), error => error instanceof SkyComputerUseError
    && error.code === -10005 && error.errorName === 'noWindowsAvailable' && error.message === 'Computer Use server error -10005: noWindowsAvailable');
  await assert.rejects(client.execute('click', {app: 'x'}), error => error.errorName === 'menuBarItemUnsupported'
    && JSON.stringify(error.meta) === JSON.stringify(meta));
  await assert.rejects(client.execute('weird', {}), error => error.errorName === 'invalidParams' && error.code === -32602);
});

test('an oversized frame from the engine, a malformed response or a closed socket fails the request in flight as a transport error; the next call reconnects', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {
    'execute:huge': (_params, {socket: peer}) => { const header = Buffer.alloc(4); header.writeUInt32LE(MAX_FRAME + 1, 0); peer.write(header); return NO_REPLY; },
    'execute:bad': (_params, {socket: peer, request}) => { peer.write(frame({jsonrpc: '2.0', id: request.id})); return NO_REPLY; },
    'execute:drop': (_params, {socket: peer}) => { peer.destroy(); return NO_REPLY; },
    'execute:ok': () => 'ok',
  }});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.execute('huge', {}), error => error instanceof SkyComputerUseTransportError && error.message === `cua engine frame is too large: ${MAX_FRAME + 1}`);
  await assert.rejects(client.execute('bad', {}), error => error instanceof SkyComputerUseTransportError && error.message === 'cua engine returned an invalid JSON-RPC response');
  await assert.rejects(client.execute('drop', {}), error => error instanceof SkyComputerUseTransportError && error.message === 'cua engine connection closed before response');
  await assert.rejects(client.execute('ok', {text: 'x'.repeat(MAX_FRAME)}), error => error instanceof SkyComputerUseTransportError && /frame is too large/.test(error.message));
  assert.equal(engine.executes().filter(p => p.method === 'ok').length, 0, 'the oversized request was never written');
  assert.equal((await client.execute('ok', {})).result, 'ok');
  assert.equal(engine.received.filter(r => r.method === 'ping').length, 4, 'each transport failure drops the connection');
});

// The agent cursor (#235's spec, "Lifecycle and identity", Interfaces): the session's `cursor` request on every new
// connection, right after the ping and before anything else; end_task's hide on the live connection only; an engine
// without the method (methodNotFound) is sent no more cursor requests on that connection, and nothing fails.
const CURSOR = {label: 'linux171', color: '#8250df', enabled: true};

test('every new connection sends the session\'s cursor request right after its ping, before the first execute', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {cursor: () => ({cursor: 'on', reason: null}), 'execute:ok': () => 'ok', 'execute:drop': (_p, {socket: peer}) => { peer.destroy(); return NO_REPLY; }}});
  const {client} = clientFor(socket, {cursor: CURSOR});
  t.after(() => client.close());
  assert.equal((await client.execute('ok', {})).result, 'ok');
  assert.deepEqual(engine.received.map(r => [r.method, r.method === 'cursor' ? r.params : r.params?.method ?? null]),
    [['ping', null], ['cursor', CURSOR], ['execute', 'ok']]);
  await assert.rejects(client.execute('drop', {}));
  await client.execute('ok', {});
  assert.deepEqual(engine.received.slice(4).map(r => r.method), ['ping', 'cursor', 'execute'], 'a reconnect is a new connection: the engine is told again');
});

test('no cursor context, no cursor request', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {'execute:ok': () => 'ok'}});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  await client.execute('ok', {});
  await client.hideCursor();
  assert.deepEqual(engine.received.map(r => r.method), ['ping', 'execute']);
});

test('hideCursor sends {hide: true} on the live connection; with none live it sends nothing and launches nothing', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const {client, launches} = clientFor(socket, {cursor: CURSOR});
  t.after(() => client.close());
  await client.hideCursor();
  assert.equal(launches.length, 0, 'an end_task never starts an engine to hide a cursor it never showed');
  const engine = await startFakeEngine(t, socket, {handlers: {cursor: () => ({cursor: 'on', reason: null}), 'execute:ok': () => 'ok'}});
  await client.execute('ok', {});
  await client.hideCursor();
  assert.deepEqual(engine.received.filter(r => r.method === 'cursor').map(r => r.params), [CURSOR, {hide: true}]);
});

test('an engine without the cursor method answers methodNotFound: the session goes on, and that connection is sent no more cursor requests', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {'execute:ok': () => 'ok'}});
  const {client} = clientFor(socket, {cursor: CURSOR});
  t.after(() => client.close());
  assert.equal((await client.execute('ok', {})).result, 'ok');
  await client.hideCursor();
  await client.execute('ok', {});
  assert.deepEqual(engine.received.map(r => r.method), ['ping', 'cursor', 'execute', 'execute'], 'no hide after methodNotFound');
});

test('a cursor request the engine refuses otherwise fails nothing either, and a later hide is still sent', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {cursor: ({hide}) => { if (!hide) throw new EngineFailure(-32602, 'Invalid params: color must be #rrggbb', 'invalidParams'); return {cursor: 'on', reason: null}; },
    'execute:ok': () => 'ok'}});
  const {client} = clientFor(socket, {cursor: CURSOR});
  t.after(() => client.close());
  assert.equal((await client.execute('ok', {})).result, 'ok');
  await client.hideCursor();
  assert.deepEqual(engine.received.filter(r => r.method === 'cursor').map(r => r.params), [CURSOR, {hide: true}]);
});

// The debug engine (no permission is asked for: ping, status and list_apps read nothing of any app).
function realEngine(t) {
  try { return debugEngine(); } catch (error) {
    t.skip(`the debug engine does not build from the current native/engine source: ${error.message.split('\n').find(line => /error:/.test(line)) ?? error.message.split('\n')[0]}`);
    return null;
  }
}
const SOURCE_IDENTITY = () => ({engineVersion: engineVersionFromSource(), build: 'unbundled'});

test('the debug engine: launched by the client through the relay when nothing answers, then ping, status and list_apps', {skip: engineSkip}, async t => {
  const bin = realEngine(t);
  if (!bin) return;
  const socket = join(scratchDir(t), 'engine.sock');
  const {client, launches} = clientFor(socket, {expected: SOURCE_IDENTITY(), launchWaitMs: 15_000, launch: () => startEngine(t, bin, {socket})});
  t.after(() => client.close());
  assert.deepEqual(await client.connect(), {serverApiVersion: 'cua-engine-1', ...SOURCE_IDENTITY()});
  assert.equal(launches.length, 1);
  const status = await client.status();
  assert.equal(status.connections, 0);
  assert.equal(typeof status.accessibility, 'boolean');
  const {result} = await client.execute('list_apps', {}, {suspend: false});
  assert.ok(Array.isArray(result) && result.every(row => typeof row.id === 'string' && typeof row.isRunning === 'boolean'));
  const mismatched = clientFor(socket, {expected: {...SOURCE_IDENTITY(), build: 'some-bundle-build'}}).client;
  t.after(() => mismatched.close());
  await assert.rejects(mismatched.connect(), error => /build unbundled/.test(error.message) && /cua install --engine/.test(error.message));
});
