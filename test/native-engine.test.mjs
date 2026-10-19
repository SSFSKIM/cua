// cua's native engine, the M0 spike's unit cases (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Plan of
// Work M0 "Spike" and the Decision Log's "M0 spike pre-flight"; Interfaces, EngineProtocol): the framing and its 8 MiB
// bound, ping, status, shutdown and its busy refusal, the lock and the socket directory, list_apps and resolve_app of
// running apps, against a debug build the test makes itself and runs directly under CUA_ENGINE_SOCKET. Nothing here may
// raise a permission dialog: no observation, capture, input, approve or keystroke probe, and no app is ever launched.
// The engine's pure logic (the walk, numbering, width rule, settle loop, decoding) is the Swift suite native-engine-units.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, statSync} from 'node:fs';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {
  API_VERSION, MAX_FRAME, Wire, debugEngine, engineEnv, engineSkip, engineVersionFromSource, frame, startEngine,
} from './helpers/engine-wire.mjs';

const skip = engineSkip;
const finderRunning = !skip && spawnSync('pgrep', ['-x', 'Finder'], {stdio: 'ignore'}).status === 0;
const finderSkip = skip || (!finderRunning && 'Finder is not running in this session');

let bin;
before(() => { if (!skip) bin = debugEngine(); });

function scratchSocket(t, sub = '') {
  const dir = shortScratch('cua-eng-');
  t.after(dir.cleanup);
  return join(dir.dir, sub, 'engine.sock');
}

async function engine(t, sub) {
  const socket = scratchSocket(t, sub);
  const started = await startEngine(t, bin, {socket});
  const wire = await Wire.connect(socket);
  t.after(() => wire.close());
  return {...started, socket, wire};
}

const run = (args, env) => spawnSync(bin, args, {env: engineEnv(env), encoding: 'utf8', timeout: 15_000});

test('ping answers the server API version, the source\'s engine version and, unbundled, the build "unbundled"', {skip}, async t => {
  const {wire} = await engine(t);
  assert.deepEqual(await wire.result('ping', {clientApiVersion: API_VERSION}),
    {serverApiVersion: API_VERSION, engineVersion: engineVersionFromSource(), build: 'unbundled'});
  const refused = await wire.call('ping', {clientApiVersion: 'cua-engine-0'});
  assert.equal(refused.error.code, -10013);
  assert.equal(refused.error.errorName, 'incompatibleClientVersion');
  assert.match(refused.error.message, /cua-engine-0.*cua-engine-1/);
});

test('status reports the engine\'s identity and grants, and counts the connections other than the requester\'s', {skip}, async t => {
  const {wire, socket, child} = await engine(t);
  const status = await wire.result('status');
  assert.equal(status.engineVersion, engineVersionFromSource());
  assert.equal(status.build, 'unbundled');
  assert.equal(status.socket, socket);
  assert.equal(status.pid, child.pid);
  assert.equal(typeof status.bundlePath, 'string');
  for (const grant of ['accessibility', 'screenRecording', 'canPostHid']) assert.equal(typeof status[grant], 'boolean', grant);
  assert.equal(status.connections, 0);
  const other = await Wire.connect(socket);
  const third = await Wire.connect(socket);
  await other.result('ping', {clientApiVersion: API_VERSION});
  await third.result('ping', {clientApiVersion: API_VERSION});
  assert.equal((await wire.result('status')).connections, 2);
  other.close();
  third.close();
  await until(async () => (await wire.result('status')).connections === 0);
});

test('framing: pipelined frames are answered in order, a frame split byte by byte is read whole, and errors keep the connection', {skip}, async t => {
  const {wire} = await engine(t);
  wire.write(Buffer.concat([
    frame({jsonrpc: '2.0', id: 11, method: 'ping', params: {clientApiVersion: API_VERSION}}),
    frame({jsonrpc: '2.0', id: 12, method: 'status', params: {}}),
  ]));
  assert.equal((await wire.next()).id, 11);
  assert.equal((await wire.next()).id, 12);

  const bytes = frame({jsonrpc: '2.0', id: 13, method: 'ping', params: {clientApiVersion: API_VERSION}});
  for (const byte of bytes) { wire.write(Buffer.from([byte])); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal((await wire.next()).result.serverApiVersion, API_VERSION);

  wire.write(frame('{"jsonrpc":"2.0","id":14,'));
  const parse = await wire.next();
  assert.equal(parse.error.code, -32700);
  assert.equal(parse.id, null);
  const unknown = await wire.call('no_such_method');
  assert.equal(unknown.error.code, -32601);
  const missing = await wire.call('ping');
  assert.equal(missing.error.code, -32602, 'ping without clientApiVersion is invalid params');
  assert.equal((await wire.result('ping', {clientApiVersion: API_VERSION})).serverApiVersion, API_VERSION, 'still open');
});

test('framing: a frame of exactly 8 MiB is read, one byte more is refused and the connection closed', {skip}, async t => {
  const {wire} = await engine(t);
  const shell = {jsonrpc: '2.0', id: 21, method: 'ping', params: {clientApiVersion: API_VERSION, pad: ''}};
  const pad = 'x'.repeat(MAX_FRAME - Buffer.byteLength(JSON.stringify(shell)));
  const exact = Buffer.from(JSON.stringify({...shell, params: {...shell.params, pad}}), 'utf8');
  assert.equal(exact.length, MAX_FRAME);
  wire.write(frame(exact));
  const answered = await wire.next(30_000);
  assert.equal(answered.id, 21);
  assert.equal(answered.result.serverApiVersion, API_VERSION);

  const header = Buffer.alloc(4);
  header.writeUInt32LE(MAX_FRAME + 1, 0);
  wire.write(header);
  const refused = await wire.next();
  assert.equal(refused.error.code, -32600);
  assert.match(refused.error.message, /8388609.*8388608/);
  assert.equal(await wire.next(), null, 'closed after the refusal');
});

test('execute refuses an unknown method and a facade method the spike does not implement, by name, with -10005', {skip}, async t => {
  const {wire} = await engine(t);
  const unknown = await wire.execute('no_such_method');
  assert.equal(unknown.error.code, -10005);
  assert.equal(unknown.error.errorName, 'unknownMethod');
  const notYet = await wire.execute('scroll', {app: 'com.apple.finder', direction: 'down'});
  assert.equal(notYet.error.code, -10005);
  assert.equal(notYet.error.errorName, 'notImplemented');
  const noApp = await wire.execute('resolve_app', {});
  assert.equal(noApp.error.code, -10005);
  assert.equal(noApp.error.errorName, 'invalidArguments');
  const late = await wire.call('execute', {method: 'list_apps', args: {}, deadlineUnixMilliseconds: Date.now() - 1});
  assert.equal(late.error.errorName, 'deadlineExceeded');
});

test('the input methods validate their arguments and resolve the app without posting anything', {skip}, async t => {
  const {wire} = await engine(t);
  const noSuch = {app: 'io.github.ssfskim.cua.engine-test.no-such-app'};
  // The app is resolved and checked first (every app-scoped method), then malformed arguments are refused by name.
  for (const [method, args, name] of [
    ['click', {app: 'com.apple.finder'}, 'invalidArguments'],
    ['click', {app: 'com.apple.finder', x: 1}, 'invalidArguments'],
    ['click', {app: 'com.apple.finder', element_index: 0, x: 1, y: 2}, 'invalidArguments'],
    ['click', {app: 'com.apple.finder', x: 1, y: 2, mouse_button: 'sideways'}, 'invalidArguments'],
    ['click', {app: 'com.apple.finder', x: 1, y: 2, click_count: 0}, 'invalidArguments'],
    ['click', {app: 'com.apple.finder', x: 1, y: 2, spikeRoute: '9'}, 'invalidArguments'],
    ['press_key', {app: 'com.apple.finder'}, 'invalidArguments'],
    ['press_key', {app: 'com.apple.finder', key: 'Ctrl'}, 'invalidKey'],  // the vendor's code has no such alias (F §6.4)
    ['type_text', {app: 'com.apple.finder'}, 'invalidArguments'],
  ]) {
    const answer = await wire.execute(method, args);
    assert.equal(answer.error?.errorName, name, `${method} ${JSON.stringify(args)}`);
  }
  // Well-formed requests resolve the app and fail on it; from there on every error carries the input meta. The
  // forced route arrives as the JSON string the harness sends, so its parse is proven by reaching the app resolution.
  for (const [method, args] of [
    ['click', {...noSuch, x: 1, y: 2}],
    ['click', {...noSuch, x: 1, y: 2, spikeRoute: '3'}],
    ['press_key', {...noSuch, key: 'Return'}],
    ['press_key', {...noSuch, key: 'Return', spikeRoute: '2'}],
    ['type_text', {...noSuch, text: 'x'}],
  ]) {
    const answer = await wire.execute(method, args);
    assert.equal(answer.error?.code, -10010, method);
    assert.equal(answer.error.errorName, 'invalidApp', method);
    const meta = answer.error.meta;
    assert.equal(meta.inputRoute, null, method);
    assert.equal(meta.startedAt, null, method);
    assert.equal(meta.endedAt, null, method);
    assert.equal(typeof meta.receivedAt, 'number', method);
    assert.equal(typeof meta.hidIdleMs, 'number', method);
  }
});

test('probe_tap refuses a missing op, an unknown app and a stop with nothing running, without creating a tap', {skip}, async t => {
  const {wire} = await engine(t);
  const noOp = await wire.call('probe_tap', {});
  assert.equal(noOp.error.errorName, 'invalidArguments');
  const noApp = await wire.call('probe_tap', {op: 'start', app: 'io.github.ssfskim.cua.engine-test.no-such-app'});
  assert.equal(noApp.error.code, -10010);
  const noTap = await wire.call('probe_tap', {op: 'stop'});
  assert.equal(noTap.error.errorName, 'tapNotRunning');
});

test('every app-scoped execute refuses a forbidden app, by bundle id or by path, before its method runs', {skip}, async t => {
  // Only methods whose bodies post nothing in this build: a refusal that failed here could at worst answer
  // notImplemented. get_app_state takes the same dispatch path but would really observe, so it is not called.
  const {wire} = await engine(t);
  const keychainPath = ['/System/Library/CoreServices/Applications/Keychain Access.app', '/System/Applications/Utilities/Keychain Access.app'].find(existsSync);
  for (const app of ['com.apple.keychainaccess', ...(keychainPath ? [keychainPath] : [])]) {
    for (const [method, args] of [['click', {element_index: 0}], ['press_key', {key: 'Return'}], ['type_text', {text: 'x'}], ['scroll', {direction: 'down'}]]) {
      const answer = await wire.execute(method, {app, ...args});
      assert.equal(answer.error?.errorName, 'appNotAllowed', `${method} on ${app}: ${JSON.stringify(answer.error)}`);
      assert.equal(answer.error.code, -10006);
    }
  }
});

test('list_apps lists running regular apps in the facade\'s row shape; resolve_app finds Finder by bundle id, name, path and pid and records its use', {skip: finderSkip}, async t => {
  const {wire, socket} = await engine(t);
  const listed = (await wire.execute('list_apps')).result;
  assert.ok(Array.isArray(listed));
  const finderRow = listed.find(row => row.id === 'com.apple.finder');
  assert.ok(finderRow, 'Finder is listed');
  assert.equal(finderRow.isRunning, true);
  assert.equal(typeof finderRow.displayName, 'string');
  assert.equal(finderRow.useCount, undefined, 'never resolved by this engine yet');
  for (const row of listed) assert.deepEqual(Object.keys(row).filter(key => !['id', 'displayName', 'isRunning', 'lastUsedDate', 'useCount'].includes(key)), []);

  const byId = (await wire.execute('resolve_app', {app: 'com.apple.finder'})).result;
  assert.equal(byId.bundleIdentifier, 'com.apple.finder');
  assert.equal(byId.isRunning, true);
  assert.equal(typeof byId.pid, 'number');
  assert.match(byId.appPath, /\/Finder\.app$/);
  assert.equal(typeof byId.displayName, 'string');
  assert.deepEqual((await wire.execute('resolve_app', {app: byId.displayName})).result, byId);
  assert.deepEqual((await wire.execute('resolve_app', {app: byId.appPath})).result, byId);
  assert.deepEqual((await wire.execute('resolve_app', {pid: byId.pid})).result, byId);

  // A flake of this count was seen once in a full run (task-1 report); the message carries what it needs to diagnose one.
  const usageText = readFileSync(join(socket, '..', 'usage.json'), 'utf8');
  const usage = JSON.parse(usageText);
  const again = (await wire.execute('list_apps')).result.find(row => row.id === 'com.apple.finder');
  const evidence = `usage.json ${usageText}; list_apps row ${JSON.stringify(again)}; socket ${socket}`;
  assert.equal(usage.apps['com.apple.finder'].useCount, 4, evidence);
  assert.equal(again.useCount, 4, evidence);
  assert.ok(!Number.isNaN(Date.parse(again.lastUsedDate)));
});

test('resolve_app refuses an unknown app as invalidApp, a forbidden one as appNotAllowed, an unknown pid as runningApplicationNotFound, without launching anything', {skip}, async t => {
  const {wire} = await engine(t);
  // Twice each: the engine caches resolutions, and a refusal must answer the same the second time.
  for (const round of [1, 2]) {
    const unknown = await wire.execute('resolve_app', {app: 'io.github.ssfskim.cua.engine-test.no-such-app'});
    assert.equal(unknown.error.code, -10010, `round ${round}`);
    assert.equal(unknown.error.errorName, 'invalidApp');
    const forbidden = await wire.execute('resolve_app', {app: 'com.apple.keychainaccess'});
    assert.equal(forbidden.error.code, -10006, `round ${round}`);
    assert.equal(forbidden.error.errorName, 'appNotAllowed');
    assert.equal(forbidden.error.message, "Computer Use is not allowed to use the app 'com.apple.keychainaccess' for safety reasons.");
  }
  const gone = await wire.execute('resolve_app', {pid: 999_999});
  assert.equal(gone.error.code, -10007);
  assert.equal(gone.error.errorName, 'runningApplicationNotFound');
});

test('shutdown is refused as busy while another connection is open, then answers and exits, removing its socket', {skip}, async t => {
  const {wire, socket, exited} = await engine(t);
  const other = await Wire.connect(socket);
  await other.result('ping', {clientApiVersion: API_VERSION});
  const busy = await wire.call('shutdown');
  assert.equal(busy.error.errorName, 'busy');
  assert.equal(busy.error.connections, 1);
  other.close();
  await until(async () => (await wire.result('status')).connections === 0);
  assert.deepEqual(await wire.result('shutdown'), {});
  assert.deepEqual(await exited, {code: 0, signal: null});
  assert.equal(existsSync(socket), false, 'the socket is removed');
});

test('a second engine on the same socket loses the lock and exits, leaving the first serving', {skip}, async t => {
  const {wire, socket} = await engine(t);
  const second = spawn(bin, [], {env: engineEnv({CUA_ENGINE_SOCKET: socket}), stdio: ['ignore', 'ignore', 'pipe']});
  let stderr = '';
  second.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise(resolve => second.once('exit', resolve));
  assert.equal(code, 75);
  assert.match(stderr, /engine\.lock/);
  assert.equal((await wire.result('ping', {clientApiVersion: API_VERSION})).serverApiVersion, API_VERSION);
});

test('an engine that finds another server answering at its socket exits rather than replacing it', {skip}, async t => {
  const socket = scratchSocket(t, 'live');
  mkdirSync(join(socket, '..'), {recursive: true, mode: 0o700});
  const squatter = createServer(connection => connection.end());
  await new Promise(resolve => squatter.listen(socket, resolve));
  t.after(() => squatter.close());
  const result = run([], {CUA_ENGINE_SOCKET: socket});
  assert.equal(result.status, 75);
  assert.match(result.stderr, /live socket found/);
  assert.ok(statSync(socket).isSocket(), 'the other server\'s socket is left in place');
});

test('the engine creates its socket directory with mode 0700', {skip}, async t => {
  const {socket} = await engine(t, 'engine-dir');
  assert.equal(statSync(join(socket, '..')).mode & 0o777, 0o700);
  assert.ok(statSync(socket).isSocket());
});

test('unbundled without CUA_ENGINE_SOCKET the engine refuses to choose a socket and exits 64', {skip}, () => {
  const result = run([]);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /CUA_ENGINE_SOCKET/);
});

test('--probe input-source current prints the active input source without changing it', {skip}, () => {
  const result = run(['--probe', 'input-source', 'current']);
  assert.equal(result.status, 0, result.stderr);
  const source = JSON.parse(result.stdout);
  assert.equal(typeof source.id, 'string');
  assert.ok(source.id.length > 0);
  assert.equal(typeof source.keyboardLayout, 'boolean');
  assert.equal(typeof source.perContextInput, 'boolean');
});

async function until(check, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('condition not reached');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
