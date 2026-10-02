#!/usr/bin/env node
// Live, read-only observation of task lifecycle behavior on the installed runtime, through `cua serve`:
//   node scripts/probe-lifecycle.mjs            (uses $CUA_HOME like the CLI)
// Each scenario opens its own connection and runs only cells that wait or write text; the first cell of a connection
// loads the vendor API, which reaches the native helper read-only. No app is bound and no GUI action is taken;
// elicitations are declined. Prints a JSON report of what the runtime actually did: whether cancellation stops a
// running cell, how end_task behaves with work in flight, what an uncertain completion does, and how long close takes.
import {spawn, spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {defaultHome} from '../src/runtime/layout.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';

const CLI = fileURLToPath(new URL('../bin/cua.mjs', import.meta.url));
const home = defaultHome();
const runtime = resolveRuntime({home});
const runtimeProcesses = () => spawnSync('ps', ['-axo', 'comm='], {encoding: 'utf8'}).stdout.split('\n').filter(c => c.startsWith(runtime.root + '/')).length;

function connect() {
  const started = Date.now();
  const at = () => Date.now() - started;
  const server = spawn(process.execPath, [CLI, 'serve'], {stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, CUA_HOME: home}});
  let stderr = '';
  server.stderr.on('data', d => { stderr += d; });
  const exited = new Promise(resolve => server.on('exit', (code, signal) => resolve({code, signal, atMs: at()})));
  const waiters = new Map();
  let nextId = 0;
  const send = msg => server.stdin.write(JSON.stringify(msg) + '\n');
  createInterface({input: server.stdout}).on('line', line => {
    const msg = JSON.parse(line);
    if (msg.method !== undefined && msg.id !== undefined) return send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}});
    waiters.get(msg.id)?.(msg);
  });
  const request = (method, params = {}) => {
    const id = ++nextId;
    send({jsonrpc: '2.0', id, method, params});
    return {id, reply: new Promise(resolve => waiters.set(id, msg => resolve({...msg, atMs: at()})))};
  };
  const call = (name, args = {}) => request('tools/call', {name, arguments: args});
  const summary = msg => ({atMs: msg.atMs, isError: msg.result?.isError ?? Boolean(msg.error), structured: msg.result?.structuredContent, text: msg.result?.content?.find(c => c.type === 'text')?.text?.slice(0, 120)});
  return {
    at, send, request, call, summary, exited, stderr: () => stderr.trim(),
    async open() {
      await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-probe-lifecycle', version: '0'}}).reply;
      send({jsonrpc: '2.0', method: 'notifications/initialized'});
      await call('js', {code: 'nodeRepl.write("ready")'}).reply;
    },
    async close() { const closeAt = at(); server.stdin.end(); const exit = await exited; return {...exit, closeMs: exit.atMs - closeAt}; },
  };
}

const sleepCell = (ms, label) => `globalThis.__probe = "${label}:started"; await new Promise(r => setTimeout(r, ${ms})); globalThis.__probe = "${label}:finished"; nodeRepl.write(globalThis.__probe)`;
const report = {release: runtime.release, at: new Date().toISOString()};

// 1. Does notifications/cancelled stop a running cell?
{
  const c = connect();
  await c.open();
  const work = c.call('js', {code: sleepCell(3000, 'cancelled')});
  await new Promise(r => setTimeout(r, 500));
  const cancelAt = c.at();
  c.send({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: work.id, reason: 'probe'}});
  const reply = await Promise.race([work.reply, new Promise(r => setTimeout(() => r(null), 8000))]);
  const after = c.summary(await c.call('js', {code: 'nodeRepl.write(String(globalThis.__probe))'}).reply);
  const end = c.summary(await c.call('end_task').reply);
  report.cancelDuringJs = {cancelAtMs: cancelAt, reply: reply && c.summary(reply), stateSeenByNextCell: after.text, endTask: end.structured, close: await c.close()};
}

// 2. end_task while a cell is running: completion waits for it, then ends.
{
  const c = connect();
  await c.open();
  const work = c.call('js', {code: sleepCell(2000, 'inflight')});
  await new Promise(r => setTimeout(r, 300));
  const endAt = c.at();
  const end = c.call('end_task');
  const late = c.call('js', {code: 'nodeRepl.write("late")'});
  report.endTaskWithWorkInFlight = {
    endAtMs: endAt,
    work: c.summary(await work.reply),
    lateWork: c.summary(await late.reply),
    endTask: c.summary(await end.reply),
    close: await c.close(),
  };
}

// 3. Uncertain completion: a cell outlasting the 5 s completion deadline fails the connection and tears it down.
{
  const c = connect();
  await c.open();
  const work = c.call('js', {code: sleepCell(15000, 'stuck'), timeout_ms: 30000});
  await new Promise(r => setTimeout(r, 300));
  const end = c.call('end_task');
  const endReply = c.summary(await end.reply);
  const workReply = c.summary(await work.reply);
  const exit = await c.exited;
  report.uncertainCompletion = {endTask: endReply, work: workReply, exit, runtimeProcessesAfterExit: runtimeProcesses(), serverStderr: c.stderr()};
}

// 4. Idle close timing.
{
  const c = connect();
  await c.open();
  report.idleClose = await c.close();
  report.idleClose.runtimeProcessesAfterExit = runtimeProcesses();
}

console.log(JSON.stringify(report, null, 1));
