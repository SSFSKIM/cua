// The owned runtime process: line-delimited JSON-RPC over its stdio, and bounded teardown of its whole process group
// that never touches a process outside it (the shared native helper is started by LaunchServices, not by us).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, writeFileSync, chmodSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {spawnUpstream} from '../src/mcp/upstream.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-upstream-process.mjs');
const UPSTREAM_URL = JSON.stringify(pathToFileURL(join(dirname(FAKE), '..', '..', 'src', 'mcp', 'upstream.mjs')).href);
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

test('a runtime that cannot start reports an exit instead of throwing', async () => {
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
  const script = `import {spawnUpstream} from ${UPSTREAM_URL};
const u = spawnUpstream({command: process.execPath, args: [${JSON.stringify(FAKE)}, 'echo'], env: {PATH: process.env.PATH}, cwd: process.cwd()}, {stderr: 'ignore'});
await u.terminate({budgetMs: 5000});
const done = Date.now();
process.on('exit', () => process.stdout.write(String(Date.now() - done)));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8', timeout: 15_000});
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Number(r.stdout) < 500, `the process lingered ${r.stdout} ms after teardown`);
});

const groupLeft = pgid => spawnSync('/usr/bin/pgrep', ['-g', String(pgid)], {encoding: 'utf8'}).stdout.split('\n').filter(Boolean).map(Number);
function reap(pids) { for (const pid of pids) try { process.kill(pid, 'SIGKILL'); } catch {} }

// An unconfirmed teardown is still the end: the bounded result must also bound the process. Here a runtime that
// ignores EOF and SIGTERM survives teardown, holding the MCP stream it inherited, in two ways: its anchor was killed
// from outside (identity lost, nothing signalled), or every group signal failed (the anchor lives on, its IPC channel
// still open).
for (const [label, options, killAnchor] of [
  ['its anchor was killed from outside', '{}', true],
  ['the group signals failed and the anchor survives', `{kill: () => { throw Object.assign(new Error('denied'), {code: 'EPERM'}); }}`, false],
]) test(`a runtime surviving teardown (${label}) cannot keep the process alive past the bounded result`, t => {
  const s = scratch();
  const pidFile = join(s.dir, 'runtime.pid');
  const anchorFile = join(s.dir, 'anchor.pid');
  t.after(() => {
    reap([pidFile, anchorFile].filter(existsSync).map(file => Number(readFileSync(file, 'utf8'))));
    s.cleanup();
  });
  const script = `import {writeFileSync} from 'node:fs';
import {spawnUpstream} from ${UPSTREAM_URL};
const u = spawnUpstream({command: process.execPath, args: [${JSON.stringify(FAKE)}, 'ignore-term'], env: {PATH: process.env.PATH, FAKE_PID_FILE: ${JSON.stringify(pidFile)}}, cwd: process.cwd()}, {stderr: 'ignore', ...${options}});
writeFileSync(${JSON.stringify(anchorFile)}, String(u.pid));
await new Promise(resolve => { u.onMessage(resolve); u.send({jsonrpc: '2.0', id: 1, method: 'ping'}); });
if (${killAnchor}) {
  process.kill(u.pid, 'SIGKILL');
  for (;;) { try { process.kill(u.pid, 0); } catch { break; } await new Promise(r => setTimeout(r, 10)); }
}
const teardown = await u.terminate({budgetMs: 100});
const done = Date.now();
process.on('exit', () => process.stdout.write(JSON.stringify({confirmed: teardown.confirmed, lingered: Date.now() - done})));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8', timeout: 5000});
  assert.equal(r.signal, null, 'still alive at the 5 s limit: the surviving runtime held the process open after teardown');
  assert.equal(r.status, 0, r.stderr);
  const {confirmed, lingered} = JSON.parse(r.stdout);
  assert.equal(confirmed, false, 'a survivor never reads as confirmed');
  assert.ok(lingered < 500, `the process lingered ${lingered} ms after teardown`);
  assert.ok(alive(Number(readFileSync(pidFile, 'utf8'))), 'the fixture runtime really did survive');
});

test('a slow-starting anchor cannot launch the runtime after teardown accepted an empty group', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const delay = join(s.dir, 'delay.cjs');
  writeFileSync(delay, 'const t = Date.now(); while (Date.now() - t < 500) {}\n');
  const slowPgrep = join(s.dir, 'slow-pgrep');
  writeFileSync(slowPgrep, `#!/bin/sh\n[ -e "${s.dir}/pgrep-once" ] || { touch "${s.dir}/pgrep-once"; sleep 0.35; }\nexec /usr/bin/pgrep "$@"\n`);
  chmodSync(slowPgrep, 0o755);
  const pidFile = join(s.dir, 'runtime.pid');
  const upstream = spawnUpstream(
    {command: process.execPath, args: [FAKE, 'ignore-term'], env: {PATH: process.env.PATH, NODE_OPTIONS: `--require ${delay}`, FAKE_PID_FILE: pidFile}, cwd: process.cwd()},
    {stderr: 'ignore', pgrep: slowPgrep},
  );
  const teardown = await upstream.terminate({budgetMs: 1000});
  await sleep(1500); // a launch that slipped past teardown would have happened by now
  const runtime = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : null;
  const left = groupLeft(upstream.pid);
  t.after(() => reap([...left, ...(runtime ? [runtime] : [])]));
  if (teardown.confirmed) {
    assert.deepEqual(left, [], 'confirmed teardown left group members');
    assert.ok(runtime === null || !alive(runtime), 'confirmed teardown, then a runtime launched and stayed alive');
  }
  assert.ok(runtime === null || !alive(runtime), 'the runtime outlived teardown');
});

test('group enumeration cannot establish emptiness before the anchor acknowledges stop', async t => {
  // Controlled ordering instead of timing: the anchor's acknowledgement is held back 400 ms and logged just before it
  // is sent, and every enumeration is logged when it starts and claims that only the anchor is left. An enumeration
  // logged before the acknowledgement would be a judgement of emptiness while a launch could still follow.
  const s = scratch();
  t.after(s.cleanup);
  const log = join(s.dir, 'order.log');
  const holdAck = join(s.dir, 'hold-ack.cjs');
  writeFileSync(holdAck, `const fs = require('node:fs');
const send = process.send?.bind(process);
if (send) process.send = (msg, ...rest) => {
  if (!msg?.stopped) return send(msg, ...rest);
  setTimeout(() => { fs.appendFileSync(${JSON.stringify(log)}, 'ack\\n'); send(msg, ...rest); }, 400);
  return true;
};
`);
  const claimEmpty = join(s.dir, 'claim-empty-pgrep');
  writeFileSync(claimEmpty, `#!/bin/sh\necho pgrep >> "${log}"\necho "$2"\n`);
  chmodSync(claimEmpty, 0o755);
  const upstream = spawnUpstream(
    {command: process.execPath, args: [FAKE, 'echo'], env: {PATH: process.env.PATH, NODE_OPTIONS: `--require ${holdAck}`}, cwd: process.cwd()},
    {stderr: 'ignore', pgrep: claimEmpty},
  );
  for (let i = 0; i < 200 && !upstream.launcherPid; i++) await sleep(10);
  t.after(() => reap([upstream.pid, upstream.launcherPid].filter(Boolean)));
  await upstream.terminate({budgetMs: 2000});
  const order = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  assert.ok(order.includes('ack'), `the anchor never acknowledged stop: ${order.join(',')}`);
  assert.equal(order[0], 'ack', `enumerated before the stop acknowledgement: ${order.join(',')}`);
});

test('failed group signals are reported: teardown is never confirmed while the anchor or a member survives', async t => {
  const {upstream, request} = start(t, 'ignore-term', [], {kill: () => { throw Object.assign(new Error('denied'), {code: 'EPERM'}); }});
  await request(1, 'ping');
  const pgid = upstream.pid;
  t.after(() => reap(groupLeft(pgid)));
  const teardown = await upstream.terminate({budgetMs: 800});
  assert.equal(teardown.confirmed, false);
  assert.match(teardown.reason, /EPERM/);
  assert.ok(alive(pgid), 'the anchor is still alive, so nothing may claim the group is gone');
});

test('a stalled group enumeration is bounded, cleaned up and reported unconfirmed', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const stall = join(s.dir, 'stall-pgrep');
  writeFileSync(stall, `#!/bin/sh\necho $$ >> "${s.dir}/stalled.pids"\nexec sleep 60\n`);
  chmodSync(stall, 0o755);
  const {upstream, request} = start(t, 'echo', [], {pgrep: stall});
  await request(1, 'ping');
  const started = Date.now();
  const teardown = await upstream.terminate({budgetMs: 800});
  assert.ok(Date.now() - started < 1500, `teardown took ${Date.now() - started} ms`);
  assert.equal(teardown.confirmed, false);
  assert.match(teardown.reason, /enumerat/);
  await sleep(100);
  const stalled = readFileSync(join(s.dir, 'stalled.pids'), 'utf8').split('\n').filter(Boolean).map(Number);
  assert.ok(stalled.length > 0);
  for (const pid of stalled) assert.equal(alive(pid), false, `enumerator ${pid} left running`);
});
