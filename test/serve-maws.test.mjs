// `cua serve` and `cua profiles list` with CUA_BROWSER_BACKENDS, as real processes against a scratch CUA_HOME whose
// "installed" release runs the fake upstream (test/fixtures/installed-home.mjs) and a fake MAWS peer
// (test/helpers/fake-maws-peer.mjs) on the configured socket (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-
// design.md, M1): each process runs its own client-mode host in chrome/m, the launch lists it first and prefers its
// instance, profiles_list puts maws ahead of the registered profiles, and one process exiting leaves another's host up.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {REPO} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';
import {clientModeDir} from '../src/chrome/extension.mjs';
import {clientSocketName} from '../src/chrome/client-mode.mjs';
import {MAWS_INSTANCE_MARKER} from '../src/chrome/discovery.mjs';
import {startFakeMawsPeer} from './helpers/fake-maws-peer.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
// The fake peer lives in this process's event loop, so the CLI runs asynchronously (spawnSync would starve it).
const cli = (home, args, env) => promisify(execFile)(process.execPath, [CLI, ...args], {env: {...process.env, CUA_HOME: home, HOME: join(home, 'user'), ...env}, encoding: 'utf8'});
const waitFor = async (predicate, what, ms = 8000) => {
  const deadline = Date.now() + ms;
  while (!predicate()) { if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`); await new Promise(r => setTimeout(r, 20)); }
};

function serve(home, env = {}) {
  const child = spawn(process.execPath, [CLI, 'serve'], {env: {...process.env, CUA_HOME: home, CUA_SHIM_SECRETS: 'off', CUA_SHIM_SURFACES: 'computer,browser', HOME: join(home, 'user'), ...env}, stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const waiters = new Map();
  createInterface({input: child.stdout}).on('line', line => { const msg = JSON.parse(line); waiters.get(msg.id)?.(msg); });
  const exit = new Promise(resolve => child.on('exit', code => resolve({code, stderr})));
  let id = 0;
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => reject(new Error(`no response to ${method}; stderr: ${stderr}`)), 15_000);
    waiters.set(n, msg => { clearTimeout(timer); waiters.delete(n); resolve(msg); });
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n');
  });
  return {child, exit, request, call: (name, args = {}) => request('tools/call', {name, arguments: args}), get stderr() { return stderr; },
    async ready() { await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}); }};
}

const records = home => readFileSync(join(home, 'state', 'codex', 'fake-upstream.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const hostSocket = (home, peer, pid) => join(clientModeDir(home), `${clientSocketName(peer.path, pid)}.sock`);

test('cua serve with a MAWS backend: its own host in chrome/m, listed first and preferred; profiles_list puts maws first; the description says so', {skip: !installedHomeSupported}, async t => {
  const home = fakeInstalledHome(t);
  const peer = await startFakeMawsPeer({path: join(home, 'maws.sock')});
  t.after(() => peer.stop());
  const server = serve(home, {CUA_BROWSER_BACKENDS: peer.path});
  await server.ready();
  const host = hostSocket(home, peer, server.child.pid);
  assert.ok(existsSync(host), server.stderr);
  const tools = (await server.request('tools/list')).result.tools;
  assert.match(tools.find(tool => tool.name === 'profiles_list').description, /In MAWS: cua\.getBrowser\(\) with no id is this session's in-app browser \(key maws\)/);
  const reply = await server.call('profiles_list');
  assert.deepEqual(reply.result.structuredContent, {status: 'ok', profiles: [{key: 'maws', ready: true, extensionInstanceId: peer.instanceId}]});
  await server.call('js', {code: 'hello'});
  const [{start}] = records(home);
  assert.equal(start.env.BROWSER_USE_BACKEND_PATHS.split(':')[0], host);
  assert.equal(start.env.BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID, peer.instanceId);
  assert.equal(start.env.CUA_BROWSER_DEFAULT_INSTANCE, peer.instanceId);
  assert.equal(start.env.CUA_BROWSER_BACKENDS, undefined, 'the configured path itself never reaches the runtime');
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
  assert.equal(existsSync(host), false, 'the host socket goes with the process');
});

test('two cua serve processes and a cua profiles list on one MAWS socket at once; the first exiting leaves the second serving', {skip: !installedHomeSupported}, async t => {
  const home = fakeInstalledHome(t);
  const peer = await startFakeMawsPeer({path: join(home, 'maws.sock')});
  t.after(() => peer.stop());
  const first = serve(home, {CUA_BROWSER_BACKENDS: peer.path});
  const second = serve(home, {CUA_BROWSER_BACKENDS: peer.path});
  await Promise.all([first.ready(), second.ready()]);
  const list = await cli(home, ['profiles', 'list', '--json'], {CUA_BROWSER_BACKENDS: peer.path});
  assert.deepEqual(JSON.parse(list.stdout).profiles, [{key: 'maws', ready: true, extensionInstanceId: peer.instanceId}]);
  const human = await cli(home, ['profiles', 'list'], {CUA_BROWSER_BACKENDS: peer.path});
  assert.match(human.stdout, new RegExp(`^maws {9}ready {6}— {12}extension instance ${peer.instanceId}$`, 'm'));
  assert.ok(peer.connections.length >= 4, 'each process connected on its own');
  const [a, b] = [hostSocket(home, peer, first.child.pid), hostSocket(home, peer, second.child.pid)];
  assert.ok(existsSync(a) && existsSync(b));
  first.child.stdin.end();
  assert.equal((await first.exit).code, 0);
  assert.equal(existsSync(a), false);
  assert.ok(existsSync(b), 'the second process\'s host stands');
  const reply = await second.call('profiles_list');
  assert.deepEqual(reply.result.structuredContent.profiles, [{key: 'maws', ready: true, extensionInstanceId: peer.instanceId}]);
  second.child.stdin.end();
  assert.equal((await second.exit).code, 0);
  assert.deepEqual(readdirSync(clientModeDir(home)), [], 'every client-mode socket is gone');
});

test('MAWS down: profiles_list reads maws_unreachable, the launch still lists the host path and the default fails closed; MAWS starting later is found without a restart', {skip: !installedHomeSupported}, async t => {
  const home = fakeInstalledHome(t);
  const path = join(home, 'maws.sock');
  const server = serve(home, {CUA_BROWSER_BACKENDS: path});
  await server.ready();
  const reply = await server.call('profiles_list');
  assert.deepEqual(reply.result.structuredContent.profiles, [{key: 'maws', ready: false, reason: 'maws_unreachable'}]);
  await server.call('js', {code: 'hello'});
  const [{start}] = records(home);
  assert.equal(start.env.BROWSER_USE_BACKEND_PATHS.split(':')[0], join(clientModeDir(home), `${clientSocketName(path, server.child.pid)}.sock`));
  assert.equal(start.env.CUA_BROWSER_DEFAULT_INSTANCE, MAWS_INSTANCE_MARKER);
  assert.equal(MAWS_INSTANCE_MARKER, 'maws:');
  assert.equal(start.env.BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID, undefined);
  const peer = await startFakeMawsPeer({path});
  t.after(() => peer.stop());
  await waitFor(() => peer.connections.length > 0, 'the 5 s retry reaching MAWS');
  await waitFor(() => existsSync(hostSocket(home, peer, server.child.pid)), 'the host listening');
  assert.deepEqual((await server.call('profiles_list')).result.structuredContent.profiles, [{key: 'maws', ready: true, extensionInstanceId: peer.instanceId}]);
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
});

test('a relative CUA_BROWSER_BACKENDS entry fails serve with invalid_setting before anything starts', {skip: !installedHomeSupported}, async t => {
  const home = fakeInstalledHome(t);
  const server = serve(home, {CUA_BROWSER_BACKENDS: 'relative/maws.sock'});
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 1);
  assert.match(stderr, /invalid_setting/);
  assert.equal(existsSync(clientModeDir(home)), false);
});
