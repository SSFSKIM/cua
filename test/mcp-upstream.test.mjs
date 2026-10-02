// The owned runtime process: line-delimited JSON-RPC over its stdio, and bounded teardown of its whole process group
// that never touches a process outside it (the shared native helper is started by LaunchServices, not by us).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {spawnUpstream} from '../src/mcp/upstream.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-upstream-process.mjs');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFile = async file => { for (let i = 0; i < 200 && !existsSync(file); i++) await sleep(10); return Number(readFileSync(file, 'utf8')); };

function start(t, mode, extraArgs = [], options = {}) {
  const diagnostics = [];
  const messages = [];
  const upstream = spawnUpstream(
    {command: process.execPath, args: [FAKE, mode, ...extraArgs], env: {PATH: process.env.PATH}, cwd: process.cwd()},
    {diagnostics: line => diagnostics.push(line), stderr: 'ignore', ...options},
  );
  let exited;
  const exit = new Promise(resolve => { exited = resolve; });
  upstream.onMessage(msg => messages.push(msg));
  upstream.onExit(info => exited(info));
  t.after(async () => { await upstream.terminate({budgetMs: 1000}); });
  const request = async (id, method, params = {}) => {
    upstream.send({jsonrpc: '2.0', id, method, params});
    for (let i = 0; i < 300; i++) { const m = messages.find(x => x.id === id); if (m) return m; await sleep(10); }
    throw new Error(`no reply to ${method}`);
  };
  return {upstream, diagnostics, messages, exit, request};
}

test('relays JSON-RPC both ways and a clean EOF exit needs no signal', async t => {
  const {upstream, request, exit} = start(t, 'echo');
  const init = await request(1, 'initialize');
  assert.equal(init.result.serverInfo.name, 'fake-upstream');
  const pid = upstream.pid;
  const teardown = await upstream.terminate({budgetMs: 2000});
  assert.deepEqual(teardown, {confirmed: true, steps: ['eof']});
  assert.equal(alive(pid), false);
  assert.equal((await exit).code, 0);
});

test('non-JSON runtime output is dropped and reported, never relayed', async t => {
  const {request, messages, diagnostics} = start(t, 'noise');
  const reply = await request(1, 'ping');
  assert.deepEqual(reply.result, {});
  assert.equal(messages.length, 1);
  assert.ok(diagnostics.some(line => /non-JSON/.test(line)));
});

test('a runtime that ignores EOF and SIGTERM is killed within the teardown budget', async t => {
  const {upstream, request} = start(t, 'ignore-term');
  await request(1, 'ping');
  const started = Date.now();
  const teardown = await upstream.terminate({budgetMs: 800});
  assert.equal(teardown.confirmed, true);
  assert.deepEqual(teardown.steps, ['eof', 'SIGTERM', 'SIGKILL']);
  assert.ok(Date.now() - started < 1200, `${Date.now() - started} ms`);
  assert.equal(alive(upstream.pid), false);
});

test('owned descendants left in the process group after the runtime exits are reaped', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const pidFile = join(s.dir, 'orphan.pid');
  const {upstream, request} = start(t, 'orphan', [pidFile]);
  await request(1, 'ping');
  const teardownPromise = upstream.terminate({budgetMs: 1000});
  const orphan = await waitFile(pidFile);
  const teardown = await teardownPromise;
  assert.equal(teardown.confirmed, true);
  assert.ok(teardown.steps.includes('SIGKILL'), teardown.steps.join(','));
  assert.equal(alive(orphan), false);
});

test('a process outside the owned group (like the shared native helper) is never signalled', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const pidFile = join(s.dir, 'helper.pid');
  const {upstream, request} = start(t, 'unowned', [pidFile]);
  await request(1, 'ping');
  const helper = await waitFile(pidFile);
  t.after(() => { try { process.kill(helper, 'SIGKILL'); } catch {} });
  const teardown = await upstream.terminate({budgetMs: 1000});
  assert.equal(teardown.confirmed, true);
  assert.equal(alive(helper), true);
});

test('an unexpected runtime exit is reported once, and sending afterwards is harmless', async t => {
  const {upstream, exit} = start(t, 'echo');
  upstream.send({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'js', arguments: {code: 'exit'}}});
  assert.equal((await exit).code, 3);
  upstream.send({jsonrpc: '2.0', id: 2, method: 'ping'});
  assert.equal((await upstream.terminate({budgetMs: 500})).confirmed, true);
});

test('a runtime that cannot start reports an exit instead of throwing', async t => {
  const upstream = spawnUpstream({command: '/nonexistent/cua-node', args: [], env: {}, cwd: process.cwd()}, {diagnostics: () => {}});
  const info = await new Promise(resolve => upstream.onExit(resolve));
  assert.equal(info.code, null);
  assert.match(info.error, /ENOENT/);
  assert.deepEqual(await upstream.terminate({budgetMs: 500}), {confirmed: true, steps: ['eof']});
});

test('once the group\'s identity cannot be established, teardown signals nothing and reports cleanup unconfirmed', async t => {
  // The group's number alone is not ownership: after its members are gone it can be reused by a stranger. Here the
  // anchor that holds the number is killed from outside, so the server can no longer prove the group is its own.
  const signals = [];
  const {upstream, request} = start(t, 'ignore-term', [], {kill: (pid, signal) => { signals.push([pid, signal]); process.kill(pid, signal); }});
  await request(1, 'ping');
  const launcher = upstream.launcherPid;
  assert.ok(alive(launcher));
  process.kill(upstream.pid, 'SIGKILL');
  for (let i = 0; i < 100 && alive(upstream.pid); i++) await sleep(10);
  const teardown = await upstream.terminate({budgetMs: 600});
  assert.equal(teardown.confirmed, false);
  assert.match(teardown.reason, /identity/);
  assert.deepEqual(signals.filter(([pid]) => pid < 0), [], 'no process-group signal without proven identity');
  process.kill(launcher, 'SIGKILL');
});

test('the anchor leads the group and holds its number until the last signal', async t => {
  const {upstream, request} = start(t, 'ignore-term');
  await request(1, 'ping');
  assert.notEqual(upstream.launcherPid, upstream.pid);
  const teardown = await upstream.terminate({budgetMs: 800});
  assert.equal(teardown.confirmed, true);
  assert.deepEqual(teardown.steps, ['eof', 'SIGTERM', 'SIGKILL']);
  assert.equal(alive(upstream.launcherPid), false);
  assert.equal(alive(upstream.pid), false);
});

test('a close right after start waits for the launch, so no runtime is born after teardown', async () => {
  const upstream = spawnUpstream({command: process.execPath, args: [FAKE, 'echo'], env: {PATH: process.env.PATH}, cwd: process.cwd()}, {stderr: 'ignore'});
  const teardown = await upstream.terminate({budgetMs: 2000});
  assert.equal(teardown.confirmed, true);
  assert.ok(upstream.launcherPid, 'the launch was observed before membership was judged');
  assert.equal(alive(upstream.launcherPid), false);
  assert.equal(alive(upstream.pid), false);
});

test('teardown leaves no timer behind that would hold the process open', () => {
  const script = `import {spawnUpstream} from ${JSON.stringify(pathToFileURL(join(dirname(FAKE), '..', '..', 'src', 'mcp', 'upstream.mjs')).href)};
const u = spawnUpstream({command: process.execPath, args: [${JSON.stringify(FAKE)}, 'echo'], env: {PATH: process.env.PATH}, cwd: process.cwd()}, {stderr: 'ignore'});
await u.terminate({budgetMs: 5000});
const done = Date.now();
process.on('exit', () => process.stdout.write(String(Date.now() - done)));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8', timeout: 15_000});
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Number(r.stdout) < 500, `the process lingered ${r.stdout} ms after teardown`);
});
