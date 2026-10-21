#!/usr/bin/env node
// Live, read-only observation of task lifecycle behavior on the installed runtime, through `cua serve`:
//   node scripts/probe-lifecycle.mjs [--engine vendor|cua]      (uses $CUA_HOME like the CLI)
// Each scenario opens its own connection and runs only cells that wait or write text; the first cell of a connection
// loads the computer API, which on the vendor engine reaches the native helper read-only (cua's service answers its
// setup without connecting to its engine). No app is bound and no GUI action is taken; elicitations are declined and
// counted per scenario (none is expected, since nothing binds an app). Prints a JSON report of what the runtime actually
// did: whether cancellation stops a running cell, how end_task behaves with work in flight, what an uncertain completion
// does, and how long close takes.
// On macOS with the computer surface the engine is pinned as verify.mjs pins it (scripts/probe/pinned-engine.mjs:
// --engine, else CUA_NATIVE_ENGINE, else the launcher's default), so the account's engine.json never chooses it, and
// every js result must attest it: any mismatch sends nothing more, closes that connection's serve, prints the report
// with `refused` and exits 1. What a closed connection leaves running is judged for either host: the processes of its
// tree seen while it was open that are still alive, and anything running from the vendor runtime's root
// (`runtimeProcessesAfterExit` counts both, `leftAfterExit` names them); the resident engine outlives connections by
// design and is not counted, but with cua's engine no process of the closed connection may still hold its socket
// (`engineSocketHeldAfterExit`, found by peer address among every Unix socket lsof shows; `engineSocketClientsUnseen`
// counts connections whose client lsof could not show, which leave that reading unproven).
// Exit 2: a usage error.
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {defaultHome} from '../src/runtime/layout.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {settingsFrom} from '../src/mcp/server.mjs';
import {attestationProblem, descendants, leftoverProcesses, unixSocketEnds, unixSockets} from './probe/lib.mjs';
import {approvedEngineFacts, LaneUsageError, pinLane, selectLane} from './probe/pinned-engine.mjs';

const CLI = fileURLToPath(new URL('../bin/cua.mjs', import.meta.url));
const usage = message => { console.error(`probe-lifecycle: ${message}`); process.exit(2); };
let options;
try {
  ({values: options} = parseArgs({options: {engine: {type: 'string'}}, strict: true}));
} catch (error) { usage(error.message); }
const home = defaultHome();
const {surfaces} = settingsFrom(process.env);
let pinned;
try { pinned = pinLane({flag: options.engine, env: process.env, home, surfaces}); } catch (error) {
  if (error instanceof LaneUsageError) usage(error.message);
  throw error;
}
const runtime = resolveRuntime({home});
const {selection, expected} = selectLane({...pinned, home, runtime, surfaces});
const engineSocket = expected?.engine === 'cua' ? approvedEngineFacts(selection).socket : null;
const sh = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8'}).stdout ?? '';
// macOS's ps; on Linux comm is truncated, so the executables are only compared by the vendor runtime's root there as
// before, and the tree's survivors by pid.
const psText = () => sh('ps', ['-axo', 'pid=,ppid=,comm=']);
const isAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const label = executable => executable.replace(runtime.root, '$RUNTIME').replace(realpathSync(process.execPath), '<host node>').replace(homedir(), '~');

function connect() {
  const started = Date.now();
  const at = () => Date.now() - started;
  const server = spawn(process.execPath, [CLI, 'serve'], {stdio: ['pipe', 'pipe', 'pipe'], env: pinned.serveEnv});
  let stderr = '';
  server.stderr.on('data', d => { stderr += d; });
  const exited = new Promise(resolve => server.on('exit', (code, signal) => resolve({code, signal, atMs: at()})));
  const waiters = new Map();
  let nextId = 0;
  let declined = 0;
  // The processes below the server seen while the connection was open, by pid (`observe` adds to them).
  const observed = new Map();
  // The ids of this connection's js calls, whose every result must attest the pinned engine.
  const jsCalls = new Set();
  // Once refused, nothing more is sent on any connection.
  const send = msg => { if (!refused) server.stdin.write(JSON.stringify(msg) + '\n'); };
  createInterface({input: server.stdout}).on('line', line => {
    if (refused) return;
    const msg = JSON.parse(line);
    if (msg.method !== undefined && msg.id !== undefined) {
      if (msg.method === 'elicitation/create') declined++;
      return send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}});
    }
    if (jsCalls.has(msg.id) && msg.result) {
      report.engine && report.engine.attested++;
      const problem = expected && attestationProblem(msg.result._meta, expected);
      if (problem) return refuse(problem, {server, exited});
    }
    waiters.get(msg.id)?.(msg);
  });
  const request = (method, params = {}) => {
    const id = ++nextId;
    if (method === 'tools/call' && params.name === 'js') jsCalls.add(id);
    send({jsonrpc: '2.0', id, method, params});
    return {id, reply: new Promise(resolve => waiters.set(id, msg => resolve({...msg, atMs: at()})))};
  };
  const call = (name, args = {}) => request('tools/call', {name, arguments: args});
  const summary = msg => ({atMs: msg.atMs, isError: msg.result?.isError ?? Boolean(msg.error), structured: msg.result?.structuredContent, text: msg.result?.content?.find(c => c.type === 'text')?.text?.slice(0, 120)});
  const observe = () => { for (const p of descendants(psText(), server.pid)) if (p.pid !== server.pid) observed.set(p.pid, p); };
  // After the server exited: what the connection left running, waiting up to 5 s for a tree that ends through its
  // parents, and which of its processes still hold cua's engine socket.
  const leftovers = async () => {
    let left = leftoverProcesses({observed: [...observed.values()], isAlive, psText: psText(), runtimeRoot: runtime.root});
    for (let waited = 0; left.length && waited < 5000; waited += 250) {
      await new Promise(resolve => setTimeout(resolve, 250));
      left = leftoverProcesses({observed: [...observed.values()], isAlive, psText: psText(), runtimeRoot: runtime.root});
    }
    // Every Unix socket lsof shows: the connection's own client end is unbound and found only by its peer address.
    const ends = engineSocket && existsSync(engineSocket) ? unixSocketEnds(unixSockets(sh('/usr/sbin/lsof', ['-U', '-F', 'pcfdn'])), engineSocket) : null;
    return {
      runtimeProcessesAfterExit: left.length,
      leftAfterExit: left.map(p => ({pid: p.pid, executable: label(p.executable)})),
      ...(engineSocket ? {
        engineSocketHeldAfterExit: [...new Set([...(ends?.bound ?? []), ...(ends?.clients ?? [])].filter(e => observed.has(e.pid)).map(e => e.pid))],
        // Connections to the engine whose client lsof did not show: while any remain, the release above is unproven.
        engineSocketClientsUnseen: ends?.unseen ?? 0,
      } : {}),
    };
  };
  return {
    at, send, request, call, summary, exited, observe, leftovers, stderr: () => stderr.trim(), declined: () => declined,
    async open() {
      await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-probe-lifecycle', version: '0'}}).reply;
      send({jsonrpc: '2.0', method: 'notifications/initialized'});
      await call('js', {code: 'nodeRepl.write("ready")'}).reply;
      observe();
    },
    async close() { const closeAt = at(); observe(); server.stdin.end(); const exit = await exited; return {...exit, closeMs: exit.atMs - closeAt, elicitationsDeclined: declined, ...await leftovers()}; },
  };
}

const sleepCell = (ms, label) => `globalThis.__probe = "${label}:started"; await new Promise(r => setTimeout(r, ${ms})); globalThis.__probe = "${label}:finished"; nodeRepl.write(globalThis.__probe)`;
const report = {release: runtime.release, at: new Date().toISOString(),
  ...(pinned.pin ? {engine: {engine: pinned.pin.engine, pinnedBy: pinned.pin.pinnedBy, host: selection.host, expected, attested: 0}} : {})};
// Every js result attests the pinned engine. Any mismatch refuses the run at once: nothing more is sent, the connection's
// serve is closed (EOF, then SIGTERM after 15 s), and the report is printed with `refused`; exit 1.
let refused = false;
async function refuse(problem, {server, exited}) {
  refused = true;
  report.refused = `refused on the attestation: ${problem}`;
  server.stdin.end();
  const exit = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve(null), 15_000))]);
  if (!exit) server.kill('SIGTERM');
  report.refusedServeExit = exit ?? await exited;
  console.log(JSON.stringify(report, null, 1));
  process.exit(1);
}

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
  c.observe();
  const end = c.call('end_task');
  const endReply = c.summary(await end.reply);
  const workReply = c.summary(await work.reply);
  const exit = await c.exited;
  report.uncertainCompletion = {endTask: endReply, work: workReply, exit, ...await c.leftovers(), elicitationsDeclined: c.declined(), serverStderr: c.stderr()};
}

// 4. Idle close timing.
{
  const c = connect();
  await c.open();
  report.idleClose = await c.close();
}

console.log(JSON.stringify(report, null, 1));
