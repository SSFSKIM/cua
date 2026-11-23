// The engine client of cua's own macOS engine service (src/services/engine/client.mjs; docs/doperpowers/specs/2026-10-18-
// own-native-engine-design.md, Design "The service", Client; Interfaces, EngineClient): the ping with its version and
// build check and its diagnostics (`cua engine stop`; `cua install --engine`, then `cua engine approve`), the launch
// through LaunchServices on a failed connect and the 5 s reconnect, the diagnostic that points at the unified log when the engine never comes up, one request in flight,
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
// Blocks this thread for `ms`, as a loaded machine or a long synchronous task does.
const stall = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

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

test('a session\'s device mode (#282) is named in every connection\'s ping, so the engine applies it per connection', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket);
  const {client} = clientFor(socket, {desktop: 'dedicated'});
  t.after(() => client.close());
  await client.connect();
  client.close();
  await client.connect();
  assert.deepEqual(engine.received.map(r => [r.method, r.params]), [['ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'}],
    ['ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'}]], 'a reconnect names it again');
});

test('an engine naming a variant (#187\'s control build) is accepted on its version and build, and the variant kept in its identity', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  await startFakeEngine(t, socket, {identity: {...IDENTITY, variant: 'control-no-inert-click'}});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  assert.deepEqual(await client.connect(), {serverApiVersion: 'cua-engine-1', ...IDENTITY, variant: 'control-no-inert-click'});
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

// After a stall the event loop runs its due timers before the I/O that completed meanwhile, so a window timer would
// beat a connect the engine had already accepted (#441, a loaded hosted runner).
test('a stall of the event loop past the first window does not make a running engine look absent: the connect it held back wins over the window', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket);
  const {client, launches, nodeRepl} = clientFor(socket);
  t.after(() => client.close());
  // The loop stalls 300 ms right after the open is requested and the 150 ms window armed; the socket connects meanwhile.
  const open = nodeRepl.nativePipe.createConnection.bind(nodeRepl.nativePipe);
  nodeRepl.nativePipe.createConnection = path => { queueMicrotask(() => stall(300)); return open(path); };
  assert.deepEqual(await client.connect(), {serverApiVersion: 'cua-engine-1', ...IDENTITY});
  assert.equal(launches.length, 0, 'the running engine is not launched over');
  assert.deepEqual(engine.received.map(r => r.method), ['ping']);
});

test('a build or version mismatch fails at once naming cua engine stop and the bundle the next launch takes, never launching, retrying or stopping that engine', async t => {
  for (const identity of [{engineVersion: '0.1.0', build: 'other'}, {engineVersion: '9.9.9', build: 'b1'}]) {
    const socket = join(scratchDir(t), 'engine.sock');
    const engine = await startFakeEngine(t, socket, {identity, handlers: {shutdown: () => assert.fail('a service never stops an engine it did not launch')}});
    const {client, launches} = clientFor(socket);
    t.after(() => client.close());
    await assert.rejects(client.connect(), error => error instanceof SkyComputerUseTransportError
      && error.message.includes('cua engine stop') && !error.message.includes('stops the old engine') && error.message.includes(`version ${identity.engineVersion} build ${identity.build}`)
      && error.message.includes('version 0.1.0 build b1') && error.message.includes('left running'));
    assert.deepEqual(engine.received.map(r => r.method), ['ping'], 'one ping, no retry');
    assert.equal(launches.length, 0);
  }
});

test('an engine speaking another API version, or refusing the client\'s, fails at once naming cua install --engine, then cua engine approve', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {ping: () => ({serverApiVersion: 'cua-engine-2', ...IDENTITY})}});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.connect(), error => error instanceof SkyComputerUseTransportError
    && /API version mismatch: client=cua-engine-1 server=cua-engine-2/.test(error.message) && error.message.includes('cua install --engine') && error.message.includes('cua engine approve'));
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
// connection, right after the ping and before anything else; end_task's hide and close on the live connection only (#237); an engine
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

// Resolves once `check()` holds, polling; fails the test past `ms`.
async function until(check, ms = 2_000) {
  for (const end = Date.now() + ms; !check();) {
    if (Date.now() > end) assert.fail('the condition never held');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('no cursor context, no cursor request: release (end_task) sends endTask (#292) and closes the connection', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {'execute:ok': () => 'ok'}});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  await client.execute('ok', {});
  client.release();
  assert.equal(client.connected, false);
  await until(() => engine.sockets.size === 0);
  assert.deepEqual(engine.received.map(r => r.method), ['ping', 'execute', 'endTask'], 'the engine read endTask before the close');
});

test('release (end_task) unpublishes the connection at once, writes {hide: true} unawaited, then endTask, and closes on its answer; with none live it sends nothing and launches nothing', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const lines = [];
  const {client, launches} = clientFor(socket, {cursor: CURSOR, log: line => lines.push(line)});
  t.after(() => client.close());
  await client.release();
  assert.equal(launches.length, 0, 'an end_task never starts an engine to close a connection it never had');
  const engine = await startFakeEngine(t, socket, {handlers: {cursor: ({hide}) => (hide ? NO_REPLY : {cursor: 'on', reason: null}), 'execute:ok': () => 'ok'}});
  await client.execute('ok', {});
  const released = client.release();
  assert.equal(client.connected, false, 'unpublished at once');
  await released;
  await until(() => engine.sockets.size === 0);
  assert.deepEqual(engine.received.filter(r => r.method === 'cursor').map(r => r.params), [CURSOR, {hide: true}], 'the engine read the hide before the close');
  assert.deepEqual(engine.received.slice(-2).map(r => [r.method, r.params]), [['cursor', {hide: true}], ['endTask', {}]], 'then endTask, its task\'s end (#292)');
  assert.deepEqual(lines, [], 'the hide abandoned by the close is not a failure, nor this engine\'s methodNotFound for endTask');
  assert.equal(launches.length, 0);
});

test('after release the next request reconnects: a new connection, told the session\'s cursor again', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {cursor: () => ({cursor: 'on', reason: null}), 'execute:ok': () => 'ok'}});
  const {client, launches} = clientFor(socket, {cursor: CURSOR});
  t.after(() => client.close());
  await client.execute('ok', {});
  client.release();
  await until(() => engine.sockets.size === 0);
  assert.equal((await client.execute('ok', {})).result, 'ok');
  assert.equal(client.connected, true);
  assert.equal(engine.sockets.size, 1);
  assert.deepEqual(engine.received.map(r => [r.method, r.method === 'cursor' ? r.params : r.params?.method ?? null]),
    [['ping', null], ['cursor', CURSOR], ['execute', 'ok'], ['cursor', {hide: true}], ['endTask', null], ['ping', null], ['cursor', CURSOR], ['execute', 'ok']]);
  assert.equal(launches.length, 0, 'the engine answered: nothing launched');
});

test('a connect in flight at release publishes nothing: its late ping answer closes the socket, the old request fails unsent, and a request after release reconnects', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let answerPing = null, held = true;
  const engine = await startFakeEngine(t, socket, {handlers: {
    ping: () => {
      const answer = {serverApiVersion: 'cua-engine-1', ...IDENTITY};
      if (!held) return answer;
      held = false;
      return new Promise(resolve => { answerPing = () => resolve(answer); });
    },
    cursor: () => ({cursor: 'on', reason: null}), 'execute:ok': () => 'ok'}});
  const {client, launches} = clientFor(socket, {cursor: CURSOR});
  t.after(() => client.close());
  const old = client.execute('ok', {});
  await until(() => answerPing !== null);
  client.release();  // end_task while the old task's connect waits for its ping
  answerPing();
  await assert.rejects(old, SkyComputerUseTransportError);
  assert.equal(client.connected, false, 'nothing published after release');
  await until(() => engine.sockets.size === 0);
  assert.deepEqual(engine.received.map(r => r.method), ['ping'], 'neither the cursor request nor the old execute was sent');
  assert.equal(launches.length, 0, 'no launch either');
  assert.equal((await client.execute('ok', {})).result, 'ok', 'a request after release reconnects');
  assert.deepEqual(engine.received.slice(1).map(r => r.method), ['ping', 'cursor', 'execute']);
});

test('requests queued at release fail unsent and never reconnect; the one in flight fails as on any close', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let finish = null;
  const engine = await startFakeEngine(t, socket, {handlers: {
    'execute:slow': () => new Promise(resolve => { finish = () => resolve('slow'); }), 'execute:ok': () => 'ok'}});
  const {client} = clientFor(socket);
  t.after(() => client.close());
  const inFlight = client.execute('slow', {});
  const queued = client.execute('ok', {});
  await until(() => finish !== null);
  client.release();
  finish();
  await assert.rejects(inFlight, SkyComputerUseTransportError);
  await assert.rejects(queued, SkyComputerUseTransportError);
  await until(() => engine.sockets.size === 0);
  assert.equal(client.connected, false);
  assert.deepEqual(engine.received.map(r => r.method === 'execute' ? r.params.method : r.method), ['ping', 'slow', 'endTask'], 'the queued request was neither sent nor reconnected for');
  assert.equal((await client.execute('ok', {})).result, 'ok');
  assert.equal(engine.received.filter(r => r.method === 'ping').length, 2);
});

test('an engine without the cursor method answers methodNotFound: the session goes on, and that connection is sent no more cursor requests', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {'execute:ok': () => 'ok'}});
  const {client} = clientFor(socket, {cursor: CURSOR});
  t.after(() => client.close());
  assert.equal((await client.execute('ok', {})).result, 'ok');
  await client.execute('ok', {});
  client.release();
  await until(() => engine.sockets.size === 0);
  assert.deepEqual(engine.received.map(r => r.method), ['ping', 'cursor', 'execute', 'execute', 'endTask'], 'no hide after methodNotFound, endTask and the close all the same');
});

test('a cursor request the engine refuses otherwise fails nothing either, is logged, and the hide is still sent at release', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {cursor: ({hide}) => { if (!hide) throw new EngineFailure(-32602, 'Invalid params: color must be #rrggbb', 'invalidParams'); return {cursor: 'on', reason: null}; },
    'execute:ok': () => 'ok'}});
  const lines = [];
  const {client} = clientFor(socket, {cursor: CURSOR, log: line => lines.push(line)});
  t.after(() => client.close());
  assert.equal((await client.execute('ok', {})).result, 'ok');
  client.release();
  await until(() => engine.sockets.size === 0);
  assert.deepEqual(engine.received.filter(r => r.method === 'cursor').map(r => r.params), [CURSOR, {hide: true}]);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /cursor request failed.*color must be #rrggbb/);
});

test('an unanswered cursor request is abandoned at its bound without closing the connection: a longer execute behind it still answers', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await startFakeEngine(t, socket, {handlers: {cursor: () => NO_REPLY,
    'execute:slow': () => new Promise(resolve => setTimeout(() => resolve('slow'), 300))}});
  const lines = [];
  const {client} = clientFor(socket, {cursor: CURSOR, cursorWaitMs: 80, log: line => lines.push(line)});
  t.after(() => client.close());
  assert.equal((await client.execute('slow', {}, {deadlineMs: 10_000})).result, 'slow');
  assert.equal(client.connected, true, 'the connection outlived the abandoned cursor request');
  assert.equal(engine.received.filter(r => r.method === 'ping').length, 1, 'no reconnect');
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /cursor request.*no answer within 80 ms/);
  client.release();
  await until(() => engine.sockets.size === 0);
  assert.equal(engine.received.filter(r => r.method === 'cursor').length, 2, 'the hide is still sent on the live connection');
});

test('methodNotFound, the older engine\'s answer, is expected and not logged', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  await startFakeEngine(t, socket, {handlers: {'execute:ok': () => 'ok'}});
  const lines = [];
  const {client} = clientFor(socket, {cursor: CURSOR, log: line => lines.push(line)});
  t.after(() => client.close());
  await client.execute('ok', {});
  assert.deepEqual(lines, []);
});

// Permission recovery (the header's): a Screen Recording permissionsPending on a screenshot-bearing observation is
// answered first; the next such observation shuts the engine down, waits for it to go, launches it through the relay
// and observes once on the fresh engine.
const PERMISSION_SENTENCE = 'cua Engine needs Screen & System Audio Recording: at the console, open System Settings → Privacy & Security → Screen & System Audio Recording, click "+", press ⌘⇧G and enter /Applications/Fake Engine.app, then switch it on; a relaunch of the engine is pending before screenshots can use it. Retry after granting it.';
const permissionFailure = () => new EngineFailure(-10014, PERMISSION_SENTENCE, 'permissionsPending', {meta: {permission: 'screenRecording'}});
const isPermission = error => error instanceof SkyComputerUseError && error.code === -10014 && error.errorName === 'permissionsPending'
  && error.message === `Computer Use server error -10014: ${PERMISSION_SENTENCE}` && error.meta?.permission === 'screenRecording';
const screenshotArgs = {app: '/A.app', includeScreenshot: true, outputDirectory: '/tmp/screenshots'};
const busyFailure = () => new EngineFailure(-10005, 'busy', 'busy', {connections: 1});

// An engine whose observation fails Screen Recording's permissionsPending unless `observe` says otherwise. Its shutdown
// answers before the process goes, as the engine's does: the launch must wait for the close, not race the lock.
async function permissionEngine(t, socket, {observe = () => { throw permissionFailure(); }, shutdown = () => {}, exitDelay = 0, handlers = {}, ...options} = {}) {
  let stopped = false;
  const engine = await startFakeEngine(t, socket, {...options, handlers: {
    'execute:get_app_state': observe,
    'execute:list_apps': () => [],
    'execute:click': () => { throw permissionFailure(); },
    shutdown: () => {
      shutdown();
      setTimeout(async () => { await engine.stop(); stopped = true; }, exitDelay);
      return {};
    },
    ...handlers,
  }});
  return {...engine, get stopped() { return stopped; }};
}

test('permissionsPending is answered first; the next screenshot shuts down, waits for the exit, launches once through the relay and observes with a fresh deadline', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const first = await permissionEngine(t, socket, {exitDelay: 120});
  let second, depthAtLaunch;
  const {client, launches, budget} = clientFor(socket, {launch: async () => {
    assert.equal(first.stopped, true, 'the old engine has exited before the launch');
    depthAtLaunch = budget.depth;
    second = await permissionEngine(t, socket, {observe: () => ({lineage: 'new'})});
  }});
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.deepEqual(first.received.map(r => r.method), ['ping', 'status', 'execute'], 'the engine\'s pid is read before the first screenshot');
  assert.equal(launches.length, 0, 'the owner gets the instruction before any restart');
  await client.execute('list_apps', {});
  assert.equal(launches.length, 0, 'other requests do not spend the pending relaunch');
  const next = client.execute('get_app_state', screenshotArgs, {deadlineMs: 1000});
  const queued = client.execute('get_app_state', screenshotArgs);
  assert.deepEqual((await next).result, {lineage: 'new'});
  await queued;
  assert.equal(depthAtLaunch, 1, 'the relaunch runs under the suspended budget');
  assert.deepEqual(launches, [{applicationPath: '/Applications/Fake Engine.app'}]);
  assert.equal(first.received.filter(r => r.method === 'shutdown').length, 1);
  assert.equal(second.executes().length, 2, 'one observation per request, the one queued behind the relaunch included');
  const observation = second.received.find(r => r.method === 'execute');
  assert.ok(observation.params.deadlineUnixMilliseconds >= Date.now() + 900, 'the shutdown and the relaunch do not shorten the observation\'s deadline');
});

test('busy leaves the engine running and repeats the original sentence and marker; once free, the next attempt relaunches even though the old engine now reads granted', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let busy = true;
  const first = await permissionEngine(t, socket, {shutdown: () => { if (busy) throw busyFailure(); }});
  let second;
  const {client, launches} = clientFor(socket, {launch: async () => { second = await permissionEngine(t, socket, {observe: () => 'captured'}); }});
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  for (let i = 0; i < 2; i++) await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.equal(client.connected, true, 'busy leaves the connection and the engine alive');
  assert.equal(first.stopped, false);
  assert.equal(launches.length, 0);
  assert.equal(first.executes().length, 1, 'no screenshot is tried again on the process that failed');
  assert.equal(first.received.filter(r => r.method === 'status').length, 1, 'the pid is read once; grants are never polled');
  busy = false;
  assert.equal((await client.execute('get_app_state', screenshotArgs)).result, 'captured');
  assert.equal(launches.length, 1);
  assert.equal(second.executes().length, 1);
});

test('a grant still missing after the relaunch answers permissionsPending without a second relaunch in the same request', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engines = [await permissionEngine(t, socket)];
  const {client, launches} = clientFor(socket, {launch: async () => { engines.push(await permissionEngine(t, socket)); }});
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.equal(launches.length, 1);
  assert.equal(engines[1].executes().length, 1);
  assert.equal(engines[1].received.some(r => r.method === 'shutdown'), false);
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.equal(launches.length, 2, 'the caller\'s next attempt may relaunch once more');
});

test('Accessibility\'s permissionsPending arms nothing: once granted, the same engine answers Screen Recording\'s, which alone arms the relaunch', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let axGranted = false;
  const engine = await permissionEngine(t, socket, {observe: () => {
    if (!axGranted) throw new EngineFailure(-10014, 'Grant Accessibility, then retry.', 'permissionsPending', {meta: {permission: 'accessibility'}});
    throw permissionFailure();
  }});
  const {client, launches} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), error => error.meta?.permission === 'accessibility');
  axGranted = true;
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.equal(launches.length, 0);
  assert.equal(engine.received.some(r => r.method === 'shutdown'), false, 'an Accessibility grant applies without a relaunch');
  assert.equal(engine.executes().length, 2);
});

test('when the failing engine has already exited, the connect\'s own launch is the relaunch: one launch, no shutdown of the fresh engine', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const first = await permissionEngine(t, socket);
  let second;
  const {client, launches} = clientFor(socket, {launch: async () => { second = await permissionEngine(t, socket, {observe: () => 'captured'}); }});
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  client.close();
  await first.stop();
  assert.equal((await client.execute('get_app_state', screenshotArgs)).result, 'captured');
  assert.equal(launches.length, 1);
  assert.equal(second.received.some(r => r.method === 'shutdown'), false);
});

test('an engine restarted by someone else (another pid) is already the relaunch, even while another client holds it', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const first = await permissionEngine(t, socket);
  const {client, launches} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  client.close();
  await first.stop();  // the owner's Quit & Reopen, or another session's restart
  const second = await permissionEngine(t, socket, {observe: () => 'captured', shutdown: () => { throw busyFailure(); }});
  const {client: other} = clientFor(socket);
  t.after(() => other.close());
  await other.connect();
  for (let i = 0; i < 3; i++) assert.equal((await client.execute('get_app_state', screenshotArgs)).result, 'captured');
  assert.equal(launches.length, 0, 'an outside restart needs no launch');
  assert.equal(second.received.some(r => r.method === 'shutdown'), false, 'the fresh engine is never stopped');
  assert.equal(second.received.filter(r => r.method === 'status').length, 1, 'the pid is kept for the live connection');
});

test('a reconnect to the same engine keeps the relaunch owed, and busy never retries the screenshot', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await permissionEngine(t, socket, {shutdown: () => { throw busyFailure(); }});
  const {client, launches} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  client.close();
  for (let i = 0; i < 2; i++) await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.equal(engine.executes().length, 1);
  assert.equal(engine.received.filter(r => r.method === 'shutdown').length, 2);
  assert.equal(launches.length, 0);
});

test('a launch request that reaches the same engine again is no relaunch: the failure stays owed', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await permissionEngine(t, socket, {shutdown: () => { throw busyFailure(); }});
  let unavailable = false;
  const {client, launches, nodeRepl} = clientFor(socket, {launch: async () => { unavailable = false; }});
  const open = nodeRepl.nativePipe.createConnection;
  nodeRepl.nativePipe.createConnection = path => unavailable ? Promise.reject(new Error('temporarily unreachable')) : open(path);
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  client.close();
  unavailable = true;
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.equal(launches.length, 1);
  assert.equal(engine.executes().length, 1, 'a launch request is no proof of a fresh process');
  assert.equal(engine.received.filter(r => r.method === 'shutdown').length, 1);
});

test('an engine whose status names no pid refuses the screenshot, shutting nothing down and keeping the relaunch owed', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const first = await permissionEngine(t, socket);
  const {client, launches} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  client.close();
  await first.stop();
  const second = await startFakeEngine(t, socket, {pid: null, handlers: {'execute:get_app_state': () => 'captured'}});
  await assert.rejects(client.execute('get_app_state', screenshotArgs), error => error instanceof SkyComputerUseTransportError && /process id/.test(error.message));
  assert.equal(second.executes().length, 0);
  assert.equal(second.received.some(r => r.method === 'shutdown'), false);
  assert.equal(launches.length, 0);
});

test('an input\'s or a text-only observation\'s permissionsPending arms no relaunch', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engine = await permissionEngine(t, socket);
  const {client, launches} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.execute('click', {}), isPermission);
  await assert.rejects(client.execute('get_app_state', {includeScreenshot: false}), isPermission);
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.equal(launches.length, 0);
  assert.equal(engine.received.some(r => r.method === 'shutdown'), false);
});

test('an owed relaunch never shuts down an engine of another build found on reconnect', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const first = await permissionEngine(t, socket);
  const {client, launches} = clientFor(socket);
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  client.close();
  await first.stop();
  const other = await startFakeEngine(t, socket, {identity: {...IDENTITY, build: 'other'}});
  await assert.rejects(client.execute('get_app_state', screenshotArgs), /cua engine stop/);
  assert.deepEqual(other.received.map(r => r.method), ['ping']);
  assert.equal(launches.length, 0);
});

test('a refused shutdown fails the screenshot, and an accepted one whose engine never closes is bounded without launching over it', async t => {
  for (const refusal of [true, false]) {
    const socket = join(scratchDir(t), 'engine.sock');
    const engine = await startFakeEngine(t, socket, {handlers: {
      'execute:get_app_state': () => { throw permissionFailure(); },
      shutdown: () => { if (refusal) throw new EngineFailure(-10005, 'shutdown refused', 'internalError'); return {}; },
    }});
    const {client, launches} = clientFor(socket, {shutdownWaitMs: 50});
    t.after(() => client.close());
    await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
    await assert.rejects(client.execute('get_app_state', screenshotArgs), refusal ? /shutdown refused/ : /did not close after shutdown/);
    assert.equal(launches.length, 0);
    assert.equal(engine.executes().length, 1);
  }
});

test('the relaunch owed survives end_task: the next task\'s screenshot relaunches, and the fresh connection is told the session\'s cursor and device mode', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const cursor = {label: 'Claude', enabled: true};
  const first = await permissionEngine(t, socket, {handlers: {endTask: () => ({released: 0}), cursor: () => ({})}});
  let second;
  const {client, launches} = clientFor(socket, {cursor, desktop: 'dedicated', log: () => {}, launch: async () => {
    second = await permissionEngine(t, socket, {observe: () => 'captured', handlers: {cursor: () => ({})}});
  }});
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  await client.release();
  assert.equal((await client.execute('get_app_state', screenshotArgs)).result, 'captured');
  assert.equal(launches.length, 1);
  assert.equal(first.received.filter(r => r.method === 'shutdown').length, 1);
  assert.deepEqual(second.received.slice(0, 2).map(r => [r.method, r.params]), [['ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'}], ['cursor', cursor]]);
});

test('end_task during the relaunch stops it there: nothing is launched for the ended task, and the next request launches the engine', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let releasing;
  const {client, launches} = clientFor(socket, {launch: async () => { await permissionEngine(t, socket, {observe: () => 'captured'}); }});
  const first = await permissionEngine(t, socket, {exitDelay: 50, shutdown: () => { releasing = client.release(); }});
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  await assert.rejects(client.execute('get_app_state', screenshotArgs), /end_task/);
  await releasing;
  await until(() => first.stopped);  // the engine refuses new clients once it accepted shutdown, then goes
  assert.equal(launches.length, 0, 'the ended task launches nothing');
  assert.equal((await client.execute('get_app_state', screenshotArgs)).result, 'captured');
  assert.equal(launches.length, 1);
});

// The relay delivers the status answer, then end_task comes before the request goes on (the review of 16a27627).
test('end_task right after the pid\'s status answer arrives cancels the screenshot: Released, nothing more written, and the next request starts afresh', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let releaseAfterStatus = false;
  let releasing;
  const engine = await startFakeEngine(t, socket, {handlers: {
    status: () => { releaseAfterStatus = releasing === undefined; return {pid: 4242}; },  // once
    'execute:get_app_state': () => 'captured',
    endTask: () => ({released: 0}),
  }});
  const {client, nodeRepl} = clientFor(socket);
  const open = nodeRepl.nativePipe.createConnection;
  nodeRepl.nativePipe.createConnection = async path => {
    const pipe = await open(path);
    return {...pipe, on(event, listener) {
      if (event !== 'data') return pipe.on(event, listener);
      return pipe.on(event, chunk => {
        listener(chunk);  // the status answer settles here; its awaiting request resumes only after this turn
        if (releaseAfterStatus) { releaseAfterStatus = false; releasing = client.release(); }
      });
    }};
  };
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), error => error instanceof SkyComputerUseTransportError
    && error.message === 'cua engine: the task ended (end_task) before this request reached the engine');
  await releasing;
  assert.equal(engine.executes().length, 0, 'the ended task\'s screenshot is never written');
  assert.deepEqual(engine.received.map(r => r.method), ['ping', 'status', 'endTask']);
  assert.equal((await client.execute('get_app_state', screenshotArgs)).result, 'captured');
});

// With a relaunch owed, end_task one microtask after the status answer: after the pid read has checked the generation
// and returned, before the request goes on to the relaunch (the review of fda61df9). The idle engine would take a
// `shutdown` and exit for a request that was cancelled.
test('end_task after the pid read returns, with a relaunch owed, writes no shutdown: Released, and the engine keeps running', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let armed = false;
  let releaseAfterStatus = false;
  let releasing;
  const engine = await permissionEngine(t, socket, {pid: 4242, handlers: {
    status: () => { releaseAfterStatus = armed; armed = false; return {pid: 4242}; },
    endTask: () => ({released: 0}),
  }});
  const {client, nodeRepl, launches} = clientFor(socket);
  const open = nodeRepl.nativePipe.createConnection;
  nodeRepl.nativePipe.createConnection = async path => {
    const pipe = await open(path);
    return {...pipe, on(event, listener) {
      if (event !== 'data') return pipe.on(event, listener);
      return pipe.on(event, chunk => {
        listener(chunk);
        if (releaseAfterStatus) { releaseAfterStatus = false; queueMicrotask(() => { releasing = client.release(); }); }
      });
    }};
  };
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  client.close();  // the next screenshot reads the pid on a new connection to the same engine: the relaunch stays owed
  armed = true;
  await assert.rejects(client.execute('get_app_state', screenshotArgs), error => error instanceof SkyComputerUseTransportError
    && error.message === 'cua engine: the task ended (end_task) before this request reached the engine');
  await releasing;
  assert.deepEqual(engine.received.map(r => r.method), ['ping', 'status', 'execute', 'ping', 'status', 'endTask']);
  assert.equal(engine.stopped, false);
  assert.equal(launches.length, 0);
});

test('a launch that brings back the engine that failed (the same pid) is no replacement: the original error, nothing observed, the relaunch still owed', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  const engines = [await permissionEngine(t, socket, {pid: 4242})];
  const {client, launches} = clientFor(socket, {launch: async () => {
    engines.push(await permissionEngine(t, socket, {pid: engines.length === 1 ? 4242 : 4343, observe: () => 'captured'}));
  }});
  t.after(() => client.close());
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  await assert.rejects(client.execute('get_app_state', screenshotArgs), isPermission);
  assert.equal(launches.length, 1);
  assert.equal(engines[1].executes().length, 0, 'no observation on an unconfirmed replacement');
  assert.equal((await client.execute('get_app_state', screenshotArgs)).result, 'captured', 'the next screenshot relaunches again');
  assert.equal(engines[1].received.filter(r => r.method === 'shutdown').length, 1);
  assert.equal(launches.length, 2);
  assert.equal(engines[2].executes().length, 1);
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
  await assert.rejects(mismatched.connect(), error => /build unbundled/.test(error.message) && /cua engine stop/.test(error.message));
});

// The review of d2568c76..96c6f093: the real relay closes fully (src/repl-host/native-pipe.mjs: end, then destroy), and
// the engine stops reading a connection whose answer it could not write, so endTask must be answered before the close.
function fullCloseRepl() {
  const repl = workerRepl();
  const open = repl.nodeRepl.nativePipe.createConnection.bind(repl.nodeRepl.nativePipe);
  repl.nodeRepl.nativePipe.createConnection = async path => {
    const pipe = await open(path);
    const socket = repl.nodeRepl.nativePipe.connections.at(-1);
    return {...pipe, end() { socket.end(() => socket.destroy()); }};
  };
  return repl;
}

test('over a fully closing relay, release closes only once endTask is answered, and resolves then', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let answered = null;
  const engine = await startFakeEngine(t, socket, {handlers: {cursor: ({hide}) => (hide ? NO_REPLY : {cursor: 'on', reason: null}), 'execute:ok': () => 'ok',
    endTask: async () => { await new Promise(resolve => setTimeout(resolve, 60)); answered = performance.now(); return {released: 1}; }}});
  const {nodeRepl} = fullCloseRepl();
  const client = createEngineClient({nodeRepl, appPath: '/Applications/Fake Engine.app', socketPath: socket, expected: IDENTITY, firstConnectMs: 150, launchWaitMs: 1500, cursor: CURSOR});
  t.after(() => client.close());
  await client.execute('ok', {});
  const engineSocket = [...engine.sockets][0];
  let closedAt = null;
  engineSocket.on('end', () => { closedAt = performance.now(); });
  await client.release();
  assert.ok(answered !== null, 'endTask was answered before release resolved');
  await until(() => closedAt !== null);
  assert.ok(closedAt >= answered, 'the close came after endTask\'s answer');
  assert.deepEqual(engine.received.slice(-2).map(r => r.method), ['cursor', 'endTask']);
});

test('an endTask the engine never answers holds the close back at most its bound, and a request in flight fails at once', async t => {
  const socket = join(scratchDir(t), 'engine.sock');
  let finish = null;
  const engine = await startFakeEngine(t, socket, {handlers: {endTask: () => NO_REPLY,
    'execute:slow': () => new Promise(resolve => { finish = () => resolve('slow'); })}});
  const {nodeRepl} = fullCloseRepl();
  const client = createEngineClient({nodeRepl, appPath: '/Applications/Fake Engine.app', socketPath: socket, expected: IDENTITY, firstConnectMs: 150, launchWaitMs: 1500, endTaskWaitMs: 120});
  t.after(() => client.close());
  const inFlight = client.execute('slow', {});
  await until(() => finish !== null);
  const started = performance.now();
  const released = client.release();
  await assert.rejects(inFlight, SkyComputerUseTransportError, 'the ended task\'s request fails at once');
  await released;
  const waited = performance.now() - started;
  assert.ok(waited >= 100 && waited < 1_000, `closed after the bound (${Math.round(waited)} ms)`);
  await until(() => engine.sockets.size === 0);
  finish();
});
