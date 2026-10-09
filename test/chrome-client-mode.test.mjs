// The host's client mode (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md, "cua: the host's client
// mode, discovery, profiles_list"): CUA_BROWSER_BACKENDS names MAWS sockets; for each, a process connects, runs the
// host over that connection and listens at $CUA_HOME/chrome/m/<socketNameFor(path)>-<pid>.sock while connected,
// retrying a refused or lost connection every 5 s. Against the fake MAWS peer (test/helpers/fake-maws-peer.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {connect} from 'node:net';
import {join} from 'node:path';
import {
  CLIENT_RETRY_MS, HELLO_WAIT_MS, clientSocketName, configuredBackends, isMawsInstance, mawsKey, startClientBackends,
} from '../src/chrome/client-mode.mjs';
import {backendDir, clientModeDir, logDir, socketNameFor} from '../src/chrome/extension.mjs';
import {createPeer, frameDecoder} from '../src/chrome/protocol.mjs';
import {startFakeMawsPeer} from './helpers/fake-maws-peer.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';

const waitFor = async (predicate, what, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (!predicate()) { if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`); await new Promise(r => setTimeout(r, 5)); }
};

function home(t) {
  const s = shortScratch('cua-cm-');
  t.after(s.cleanup);
  return s.dir;
}

// The vendor's side of a host socket: getInfo, and a session's createTab.
function vendorClient(path) {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    const peer = createPeer({send: bytes => socket.write(bytes)});
    const decode = frameDecoder();
    socket.on('data', chunk => { for (const m of decode(chunk)) peer.receive(m); });
    socket.once('error', reject);
    socket.once('connect', () => resolve({request: (m, p) => peer.request(m, p), close: () => socket.destroy()}));
  });
}

test('CUA_BROWSER_BACKENDS: absolute socket paths separated by ":", deduplicated; a relative one is invalid_setting', () => {
  assert.deepEqual(configuredBackends({}), []);
  assert.deepEqual(configuredBackends({CUA_BROWSER_BACKENDS: ''}), []);
  assert.deepEqual(configuredBackends({CUA_BROWSER_BACKENDS: '/a/x.sock::/b/y.sock:/a/x.sock'}), ['/a/x.sock', '/b/y.sock']);
  assert.throws(() => configuredBackends({CUA_BROWSER_BACKENDS: '/a/x.sock:rel/y.sock'}), e => e.code === 'invalid_setting' && /absolute/.test(e.message));
  assert.equal(clientSocketName('/a/x.sock', 4242), `${socketNameFor('/a/x.sock')}-4242`);
  assert.deepEqual([0, 1, 2].map(mawsKey), ['maws', 'maws-2', 'maws-3']);
  assert.equal(isMawsInstance('maws:abc'), true);
  assert.equal(isMawsInstance('3f1c-uuid'), false);
  assert.equal(CLIENT_RETRY_MS, 5000);
  assert.equal(HELLO_WAIT_MS, 5000);
});

test('connected: the host listens at chrome/m/<name>-<pid>.sock (0700 dir, 0600 socket), status in chrome/b, log in chrome/logs; the entry is ready', async t => {
  const h = home(t);
  const peerPath = join(h, 'p.sock');
  const peer = await startFakeMawsPeer({path: peerPath});
  t.after(() => peer.stop());
  const client = startClientBackends({home: h, paths: [peerPath], pid: 4242});
  t.after(() => client.close());
  await client.waitForHellos();
  const name = clientSocketName(peerPath, 4242);
  const socketPath = join(clientModeDir(h), `${name}.sock`);
  assert.deepEqual(client.hostPaths(), [socketPath]);
  assert.equal(statSync(clientModeDir(h)).mode & 0o777, 0o700);
  assert.equal(statSync(socketPath).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(backendDir(h)).filter(n => n.endsWith('.sock')), [], 'nothing listens in chrome/b');
  assert.equal(JSON.parse(readFileSync(join(backendDir(h), `${name}.json`), 'utf8')).instanceId, peer.instanceId);
  assert.ok(existsSync(join(logDir(h), `${name}.log`)));
  assert.deepEqual(client.entries(), [{key: 'maws', ready: true, extensionInstanceId: peer.instanceId}]);
  assert.equal(client.defaultInstance(), peer.instanceId);

  const vendor = await vendorClient(socketPath);
  const info = await vendor.request('getInfo', {});
  assert.deepEqual(info.metadata, {extensionInstanceId: peer.instanceId, profileName: 'MAWS'});
  vendor.close();

  await client.close();
  assert.equal(existsSync(socketPath), false, 'closing removes the host socket');
  assert.equal(existsSync(join(backendDir(h), `${name}.json`)), false);
  await waitFor(() => peer.live().length === 0, 'the peer seeing the connection close');
});

test('MAWS down at start: the wait ends at the first refusal, the entry reads maws_unreachable, and the host appears once MAWS listens', async t => {
  const h = home(t);
  const peerPath = join(h, 'p.sock');
  const client = startClientBackends({home: h, paths: [peerPath], pid: 7, retryMs: 50});
  t.after(() => client.close());
  const started = Date.now();
  await client.waitForHellos(2000);
  assert.ok(Date.now() - started < 1000, 'no fixed 5 s wait when nothing listens');
  assert.deepEqual(client.entries(), [{key: 'maws', ready: false, reason: 'maws_unreachable'}]);
  assert.equal(client.defaultInstance(), null);
  assert.equal(existsSync(client.hostPaths()[0]), false, 'the host socket exists only while connected');
  const peer = await startFakeMawsPeer({path: peerPath});
  t.after(() => peer.stop());
  await waitFor(() => client.entries()[0].ready, 'the retry connecting');
  assert.equal(existsSync(client.hostPaths()[0]), true);
});

test('MAWS quitting and coming back: the host exits with the connection and reconnects on the next retry, same instance', async t => {
  const h = home(t);
  const peerPath = join(h, 'p.sock');
  let peer = await startFakeMawsPeer({path: peerPath});
  const client = startClientBackends({home: h, paths: [peerPath], pid: 8, retryMs: 50});
  t.after(() => client.close());
  await client.waitForHellos();
  const [hostPath] = client.hostPaths();
  assert.equal(client.entries()[0].ready, true);
  await peer.stop();
  await waitFor(() => !client.entries()[0].ready && !existsSync(hostPath), 'the host exiting with the connection');
  assert.deepEqual(client.entries(), [{key: 'maws', ready: false, reason: 'maws_unreachable'}]);
  assert.equal(client.defaultInstance(), peer.instanceId, 'the instance is remembered while MAWS is away');
  peer = await startFakeMawsPeer({path: peerPath});
  t.after(() => peer.stop());
  await waitFor(() => client.entries()[0].ready && existsSync(hostPath), 'the reconnect');
  assert.equal(client.entries()[0].extensionInstanceId, peer.instanceId);
});

test('two processes on one MAWS socket each run their own host; the first closing leaves the second serving', async t => {
  const h = home(t);
  const peerPath = join(h, 'p.sock');
  const peer = await startFakeMawsPeer({path: peerPath});
  t.after(() => peer.stop());
  const first = startClientBackends({home: h, paths: [peerPath], pid: 101});
  const second = startClientBackends({home: h, paths: [peerPath], pid: 102});
  t.after(() => second.close());
  await Promise.all([first.waitForHellos(), second.waitForHellos()]);
  assert.notEqual(first.hostPaths()[0], second.hostPaths()[0]);
  assert.equal(peer.live().length, 2);
  await first.close();
  assert.equal(existsSync(first.hostPaths()[0]), false);
  await waitFor(() => peer.live().length === 1, 'one connection left');
  const vendor = await vendorClient(second.hostPaths()[0]);
  const tab = await vendor.request('createTab', {session_id: 's', turn_id: 't'});
  assert.ok(Number.isInteger(tab.id));
  vendor.close();
  assert.equal(second.entries()[0].ready, true);
});

test('a second configured backend is maws-2; a refused hello (another protocol major) is retried, never listened for', async t => {
  const h = home(t);
  const a = await startFakeMawsPeer({path: join(h, 'a.sock')});
  const b = await startFakeMawsPeer({path: join(h, 'b.sock'), extension: {protocolVersion: 2}});
  t.after(() => Promise.all([a.stop(), b.stop()]));
  const client = startClientBackends({home: h, paths: [a.path, b.path], pid: 9, retryMs: 50});
  t.after(() => client.close());
  await client.waitForHellos(2000);
  assert.deepEqual(client.entries(), [{key: 'maws', ready: true, extensionInstanceId: a.instanceId}, {key: 'maws-2', ready: false, reason: 'maws_unreachable'}]);
  assert.equal(client.defaultInstance(), a.instanceId, 'the first configured backend is the default');
  await waitFor(() => b.connections.length >= 2, 'the refused backend retried');
  assert.equal(b.connections[0].ext.refusals[0]?.code, 'protocol_mismatch');
  assert.equal(existsSync(client.hostPaths()[1]), false);
});

test('frame limits over the MAWS socket: a 2 MiB answer reaches the vendor; a host frame over 1 MiB fails alone and the connection stays', async t => {
  const h = home(t);
  const big = 'x'.repeat(2 * 1024 * 1024);
  const peer = await startFakeMawsPeer({path: join(h, 'p.sock'), extension: {cdp: ({method, params}) => (method === 'Runtime.evaluate'
    ? {result: {type: 'string', value: params.expression === 'big' ? big : `ok:${params.expression.length}`}} : {})}});
  t.after(() => peer.stop());
  const client = startClientBackends({home: h, paths: [peer.path], pid: 11});
  t.after(() => client.close());
  await client.waitForHellos();
  const vendor = await vendorClient(client.hostPaths()[0]);
  t.after(() => vendor.close());
  const call = (method, params = {}) => vendor.request(method, {...params, session_id: 's', turn_id: 't'});
  const tab = await call('createTab');
  await call('attach', {tabId: tab.id});
  const evaluate = expression => call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression}});
  assert.equal((await evaluate('big')).result.value.length, big.length, 'MAWS -> host up to 64 MiB');
  await assert.rejects(evaluate('y'.repeat(1024 * 1024 + 1)), e => e.message === 'message_too_large');
  assert.deepEqual(await evaluate('small'), {result: {type: 'string', value: 'ok:5'}}, 'the connection survived the refused frame');
  assert.equal(peer.live().length, 1);
});
