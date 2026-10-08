// The cua host as a program (src/chrome/host.mjs runHost): hello, the socket under $CUA_HOME/chrome/b, the status
// file, the log, refusals, real frames on both wires, and the exit when the native port closes. The extension is the
// fake (test/helpers/fake-cua-extension.mjs) on a stream pair; socket clients speak the vendor backend wire.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {connect, createServer} from 'node:net';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runHost, VIEWPORT_CAPABILITY} from '../src/chrome/host.mjs';
import {createPeer, frameDecoder} from '../src/chrome/protocol.mjs';
import {backendDir, logDir, socketNameFor} from '../src/chrome/extension.mjs';
import {createFakeCuaExtension} from './helpers/fake-cua-extension.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';

const HOST = fileURLToPath(new URL('../src/chrome/host.mjs', import.meta.url));
const OTHER = 'tab owned by another session';
let nextPid = 900_000;
const waitFor = async (predicate, what, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (!predicate()) { if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`); await new Promise(r => setTimeout(r, 5)); }
};

// A host on a stream pair with the fake extension at the other end, in a short scratch home.
function start(t, {fake = {}, hello} = {}) {
  const scratch = shortScratch('cua-h1-');
  t.after(scratch.cleanup);
  const home = scratch.dir;
  const ext = createFakeCuaExtension(fake);
  const toHost = new PassThrough(), fromHost = new PassThrough();
  const pid = nextPid++;
  const port = ext.connect({toHost, fromHost, ...(hello ? {helloParams: {...ext.hello(), ...hello}} : {})});
  const done = runHost({stdin: toHost, stdout: fromHost, home, pid});
  const name = socketNameFor(ext.instanceId);
  const socketPath = join(backendDir(home), `${name}.sock`);
  const statusPath = join(backendDir(home), `${name}.json`);
  return {home, ext, port, done, name, socketPath, statusPath, pid, status: () => JSON.parse(readFileSync(statusPath, 'utf8'))};
}

// A backend client as the vendor service is one: u32-framed JSON-RPC 2.0, notifications recorded.
function backendClient(path) {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    const notes = [];
    const peer = createPeer({send: bytes => socket.write(bytes), handlers: {onCDPEvent: p => notes.push({method: 'onCDPEvent', params: p}), onCDPDetach: p => notes.push({method: 'onCDPDetach', params: p}), onDownloadChange: p => notes.push({method: 'onDownloadChange', params: p})}});
    const decode = frameDecoder();
    let closed = false;
    socket.on('data', chunk => { for (const m of decode(chunk)) peer.receive(m); });
    socket.once('error', reject);
    socket.on('close', () => { closed = true; peer.close('socket closed'); });
    socket.once('connect', () => resolve({
      notes, get closed() { return closed; },
      session(sessionId, turn = 't1') {
        return {call: (method, params = {}) => peer.request(method, {...params, session_id: sessionId, turn_id: turn, session_context: 'live'}),
          end: () => peer.request('turnEnded', {session_id: sessionId, turn_id: turn})};
      },
      request: (method, params) => peer.request(method, params),
      close: () => socket.destroy(),
    }));
  });
}

test('without CUA_HOME the host refuses to start (home_missing) and writes nothing', async () => {
  const result = await runHost({stdin: new PassThrough(), stdout: new PassThrough(), env: {}});
  assert.equal(result.code, 2);
  assert.equal(result.reason, 'home_missing');
});

test('after hello the host listens at chrome/b/<name>.sock, keeps <name>.json and logs to <name>.log; the vendor wire works end to end', async t => {
  const h = start(t, {fake: {version: '0.3.0'}});
  await waitFor(() => existsSync(h.socketPath), 'the socket');
  assert.equal(statSync(h.socketPath).mode & 0o777, 0o600);
  assert.equal(statSync(backendDir(h.home)).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(logDir(h.home)), [`${h.name}.log`], 'the <pid>.log was renamed after hello');
  assert.match(readFileSync(join(logDir(h.home), `${h.name}.log`), 'utf8'), /listening .*\.sock/);
  assert.deepEqual(h.status().sessions, []);

  const c = await backendClient(h.socketPath);
  const info = await c.request('getInfo', {session_id: 's', turn_id: 't', session_context: 'live'});
  assert.deepEqual(info, {type: 'extension', family: 'chrome', name: 'cua', version: '0.3.0', capabilities: {browser: [VIEWPORT_CAPABILITY], tab: []}, metadata: {extensionInstanceId: h.ext.instanceId}});
  await assert.rejects(c.request('getUserHistory', {session_id: 's', turn_id: 't'}), e => e.message === 'No handler registered for method: getUserHistory' && e.code === -1);
  const s = c.session('sA');
  const tab = await s.call('createTab', {});
  await s.call('attach', {tabId: tab.id});
  assert.deepEqual(await s.call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: '6*7'}}),
    {result: {type: 'string', value: 'fake-evaluated:6*7'}});
  assert.deepEqual(h.status().sessions, [{session_id: 'sA', turn_id: 't1', tabs: [{tabId: tab.id, origin: 'created', mark: 'none', attached: true}]}]);
  h.ext.cdpEvent({tabId: tab.id}, 'Page.loadEventFired', {timestamp: 2});
  await waitFor(() => c.notes.length === 1, 'the CDP event');
  assert.deepEqual(c.notes[0], {method: 'onCDPEvent', params: {source: {tabId: tab.id}, method: 'Page.loadEventFired', params: {timestamp: 2}}});
  h.ext.downloadCreated({id: 4, url: 'https://cdn.invalid/r.pdf', filename: ''});
  h.ext.downloadChanged(4, {filename: '/d/r.pdf', state: 'complete'});
  await waitFor(() => c.notes.length === 3, 'the download notifications');
  assert.deepEqual(c.notes.slice(1), [{method: 'onDownloadChange', params: {id: '4', filename: '', url: 'https://cdn.invalid/r.pdf', status: 'started'}},
    {method: 'onDownloadChange', params: {id: '4', filename: '/d/r.pdf', url: 'https://cdn.invalid/r.pdf', status: 'complete'}}]);
  await s.end();
  assert.equal(h.ext.state.tabs.has(tab.id), false);
  assert.deepEqual(h.status().sessions[0].tabs, []);
  c.close();
  h.port.disconnect();
  assert.equal((await h.done).code, 0);
});

test('two clients each drive their own tab; neither lists the other\'s, and executeCdp on the other\'s is refused', async t => {
  const h = start(t);
  await waitFor(() => existsSync(h.socketPath), 'the socket');
  const [c1, c2] = await Promise.all([backendClient(h.socketPath), backendClient(h.socketPath)]);
  const s1 = c1.session('serve-1'), s2 = c2.session('serve-2');
  const t1 = await s1.call('createTab', {}), t2 = await s2.call('createTab', {});
  await s1.call('attach', {tabId: t1.id});
  await s2.call('attach', {tabId: t2.id});
  assert.deepEqual((await s1.call('getTabs')).map(x => x.id), [t1.id]);
  assert.deepEqual((await s2.call('getTabs')).map(x => x.id), [t2.id]);
  await assert.rejects(s2.call('executeCdp', {target: {tabId: t1.id}, method: 'Runtime.evaluate', commandParams: {expression: '1'}}), e => e.message === OTHER);
  h.ext.cdpEvent({tabId: t1.id}, 'Page.frameNavigated', {});
  await waitFor(() => c1.notes.length === 1, 'client 1\'s event');
  assert.deepEqual(c2.notes, []);
  c1.close();
  await waitFor(() => !h.ext.state.tabs.has(t1.id), 'client 1\'s tab closing on disconnect');
  assert.equal(h.ext.state.tabs.has(t2.id), true);
  c2.close();
  h.port.disconnect();
  await h.done;
});

test('a hello of another protocol major is refused with protocol_mismatch, told to the extension, and nothing listens', async t => {
  const h = start(t, {hello: {protocolVersion: 2}});
  const result = await h.done;
  assert.equal(result.code, 1);
  assert.equal(result.reason, 'protocol_mismatch');
  await waitFor(() => h.port.received.length > 0, 'the refusal');
  assert.equal(h.port.received[0].method, 'hostRefused');
  assert.equal(h.port.received[0].params.code, 'protocol_mismatch');
  assert.equal(existsSync(h.socketPath), false);
  assert.match(readFileSync(result.logPath, 'utf8'), /refused protocol_mismatch/);
});

test('a stale socket file is replaced; a live one means another host serves the profile (already_served)', async t => {
  const scratch = shortScratch('cua-h1-');
  t.after(scratch.cleanup);
  const ext = createFakeCuaExtension();
  const path = join(backendDir(scratch.dir), `${socketNameFor(ext.instanceId)}.sock`);
  const {mkdirSync} = await import('node:fs');
  mkdirSync(backendDir(scratch.dir), {recursive: true, mode: 0o700});
  // Live: a listener at the path.
  const other = createServer(s => s.end());
  await new Promise(r => other.listen(path, r));
  const toHost = new PassThrough(), fromHost = new PassThrough();
  const port = ext.connect({toHost, fromHost});
  const liveLog = join(logDir(scratch.dir), `${socketNameFor(ext.instanceId)}.log`);
  mkdirSync(logDir(scratch.dir), {recursive: true});
  writeFileSync(liveLog, 'the live host\'s log\n');
  const refused = await runHost({stdin: toHost, stdout: fromHost, home: scratch.dir, pid: nextPid++});
  assert.equal(refused.reason, 'already_served');
  assert.equal(existsSync(path), true, 'the live socket is left alone');
  assert.equal(readFileSync(liveLog, 'utf8'), 'the live host\'s log\n', 'the live host\'s log is left alone');
  assert.match(readFileSync(refused.logPath, 'utf8'), /refused already_served/);
  port.disconnect();
  await new Promise(r => other.close(r));
  // Stale: a plain file where the socket was (the listener died without unlinking).
  writeFileSync(path, '');
  const ext2 = createFakeCuaExtension({instanceId: ext.instanceId});
  const in2 = new PassThrough(), out2 = new PassThrough();
  const port2 = ext2.connect({toHost: in2, fromHost: out2});
  const done = runHost({stdin: in2, stdout: out2, home: scratch.dir, pid: nextPid++});
  await waitFor(() => existsSync(path) && statSync(path).isSocket(), 'the new socket');
  const c = await backendClient(path);
  assert.equal((await c.request('getInfo', {})).metadata.extensionInstanceId, ext.instanceId);
  c.close();
  port2.disconnect();
  assert.equal((await done).code, 0);
});

test('an exiting host never removes its successor\'s socket or status file', async t => {
  const first = start(t);
  await waitFor(() => existsSync(first.socketPath), 'the first socket');
  // A client that keeps its side open after the host ends its own, so the first host's close waits on it.
  const lingering = connect({path: first.socketPath, allowHalfOpen: true});
  await new Promise((resolve, reject) => { lingering.once('connect', resolve); lingering.once('error', reject); });
  lingering.on('error', () => {});
  first.port.disconnect();
  await waitFor(() => !existsSync(first.socketPath) || !existsSync(first.statusPath), 'the first host to give up the path');
  // The extension reconnects: a second host for the same instance id while the first is still closing.
  const ext2 = createFakeCuaExtension({instanceId: first.ext.instanceId});
  const in2 = new PassThrough(), out2 = new PassThrough();
  const port2 = ext2.connect({toHost: in2, fromHost: out2});
  const second = runHost({stdin: in2, stdout: out2, home: first.home, pid: nextPid++});
  await waitFor(() => existsSync(first.socketPath) && existsSync(first.statusPath), 'the successor listening');
  assert.equal((await first.done).code, 0);
  lingering.destroy();
  assert.equal(existsSync(first.socketPath), true, 'the successor\'s socket survives');
  assert.equal(existsSync(first.statusPath), true, 'the successor\'s status file survives');
  const c = await backendClient(first.socketPath);
  assert.equal((await c.request('getInfo', {})).metadata.extensionInstanceId, first.ext.instanceId);
  c.close();
  port2.disconnect();
  assert.equal((await second).code, 0);
});

test('the port dropping mid-task fails pending requests with "extension disconnected", cleans up and exits', async t => {
  const h = start(t);
  await waitFor(() => existsSync(h.socketPath), 'the socket');
  const c = await backendClient(h.socketPath);
  const s = c.session('sA');
  const tab = await s.call('createTab', {});
  await s.call('attach', {tabId: tab.id});
  h.ext.holdCdp('Page.navigate');
  const pending = s.call('executeCdp', {target: {tabId: tab.id}, method: 'Page.navigate', commandParams: {url: 'https://a.fixture.invalid/'}});
  await waitFor(() => h.ext.calls.some(x => x.method === 'debugger.sendCommand'), 'the command reaching the extension');
  h.port.disconnect();
  await assert.rejects(pending, e => e.message === 'extension disconnected');
  const result = await h.done;
  assert.equal(result.code, 0);
  assert.equal(result.reason, 'port_closed');
  await waitFor(() => c.closed, 'the client socket closing');
  assert.equal(existsSync(h.socketPath), false);
  assert.equal(existsSync(h.statusPath), false);
  assert.match(readFileSync(result.logPath, 'utf8'), /native port closed/);
});

test('a host->extension frame over 1 MB is refused with message_too_large and the port stays up', async t => {
  const h = start(t);
  await waitFor(() => existsSync(h.socketPath), 'the socket');
  const c = await backendClient(h.socketPath);
  const s = c.session('sA');
  const tab = await s.call('createTab', {});
  await s.call('attach', {tabId: tab.id});
  await assert.rejects(s.call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: `'${'x'.repeat(1024 * 1024)}'`}}),
    e => e.message === 'message_too_large');
  assert.equal(h.ext.calls.filter(x => x.method === 'debugger.sendCommand').length, 0, 'the oversized command never reached the extension');
  assert.deepEqual(await s.call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: '1'}}), {result: {type: 'string', value: 'fake-evaluated:1'}});
  c.close();
  h.port.disconnect();
  await h.done;
});

test('as a process: started without CUA_HOME it exits 2 with home_missing on stderr', async () => {
  const child = spawn(process.execPath, [HOST], {env: {PATH: process.env.PATH}, stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const code = await new Promise(resolve => child.on('exit', resolve));
  assert.equal(code, 2);
  assert.match(stderr, /home_missing/);
});
