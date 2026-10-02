#!/usr/bin/env node
// Checks the standalone server end to end through the actual launcher: `cua serve` on the installed runtime in
// $CUA_HOME (default ~/Library/Application Support/cua). It runs the MCP handshake, checks the four-tool surface and
// instructions, and exercises task identity with trivial cells that touch no app: the first cell loads the vendor API
// (its banner), which reaches the native helper read-only. Then end_task, a second task, and EOF. It records which
// executables served (none may come from an installed desktop app), which helper held the native socket, and that
// the connection's working directory is gone afterwards. Elicitations are declined; nothing is registered anywhere.
//
//   node verify.mjs            exit 0 when every check passes; prints a JSON report either way
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {defaultHome} from './src/runtime/layout.mjs';
import {resolveRuntime} from './src/runtime/manifest.mjs';
import {descendants, classifyProcesses, socketHolders} from './scripts/probe/lib.mjs';

const CLI = fileURLToPath(new URL('./bin/cua.mjs', import.meta.url));
const NATIVE_SOCKET = join(homedir(), 'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock');
const MODEL_TOOLS = ['js', 'js_reset', 'end_task', 'secrets_list'];
const home = defaultHome();
const problems = [];
const report = {home, problems};
const check = (ok, problem) => { if (!ok) problems.push(problem); return ok; };
const sh = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8'}).stdout ?? '';

let runtime;
try {
  runtime = resolveRuntime({home});
  report.release = runtime.release;
} catch (error) {
  console.error(`verify: ${error.message}${error.hint ? `\n  ${error.hint}` : ''}`);
  process.exit(1);
}
const runDir = join(runtime.home, 'run');
const runBefore = existsSync(runDir) ? readdirSync(runDir) : [];

const server = spawn(process.execPath, [CLI, 'serve'], {stdio: ['pipe', 'pipe', 'inherit'], env: {...process.env, CUA_HOME: home}});
const exited = new Promise(resolve => server.on('exit', (code, signal) => resolve({code, signal})));
const pending = new Map();
let nextId = 0;
report.elicitationsDeclined = 0;
const send = msg => server.stdin.write(JSON.stringify(msg) + '\n');
createInterface({input: server.stdout}).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.method === 'elicitation/create' && msg.id !== undefined) { report.elicitationsDeclined++; return send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}}); }
  if (msg.method !== undefined && msg.id !== undefined) return send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'not supported by verify'}});
  const waiter = pending.get(msg.id);
  if (!waiter) return;
  pending.delete(msg.id);
  msg.error ? waiter.reject(new Error(`${msg.error.code}: ${msg.error.message}`)) : waiter.resolve(msg.result);
});
const request = (method, params = {}, timeoutMs = 30_000) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} got no answer within ${timeoutMs} ms`)); }, timeoutMs);
  pending.set(id, {resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); }});
  send({jsonrpc: '2.0', id, method, params});
});
const call = (name, args = {}, timeoutMs) => request('tools/call', {name, arguments: args}, timeoutMs);
const taskOf = result => result?._meta?.['cua/taskId'] ?? null;

try {
  const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-verify', version: '0'}}, 120_000);
  send({jsonrpc: '2.0', method: 'notifications/initialized'});
  const instructions = init.instructions ?? '';
  report.server = init.serverInfo;
  report.protocolVersion = init.protocolVersion;
  report.instructionsChars = instructions.length;
  check(/Host notes/.test(instructions), 'host notes missing from instructions');
  check(instructions.length <= 2048, 'instructions exceed the 2048-character cap');

  const {tools} = await request('tools/list');
  report.tools = tools.map(t => t.name);
  check(JSON.stringify(report.tools) === JSON.stringify(MODEL_TOOLS), `tools are ${report.tools.join(', ')}, expected ${MODEL_TOOLS.join(', ')}`);
  check(tools.every(t => t._meta?.['anthropic/searchHint']), 'a tool lacks anthropic/searchHint');
  check(!tools.some(t => t._meta?.['anthropic/alwaysLoad']), 'a tool carries anthropic/alwaysLoad; the tools are meant to defer');

  const idleEnd = await call('end_task');
  check(idleEnd.structuredContent?.status === 'noop', `end_task with no task returned ${JSON.stringify(idleEnd.structuredContent)}`);
  report.secretsList = (await call('secrets_list')).structuredContent;

  const first = await call('js', {code: 'nodeRepl.write("cua-verify")', title: 'cua verify'}, 120_000);
  const second = await call('js', {code: 'nodeRepl.write("cua-verify again")', title: 'cua verify'}, 60_000);
  check(!first.isError && !second.isError, 'a trivial js cell returned an error');
  const taskId = taskOf(first);
  report.task = {first: taskId, sameTaskAcrossCalls: taskId !== null && taskOf(second) === taskId};
  check(report.task.sameTaskAcrossCalls, 'two js calls in one task carried different task IDs');

  const tree = descendants(sh('ps', ['-axo', 'pid=,ppid=,comm=']), server.pid).filter(p => p.pid !== server.pid);
  const classification = classifyProcesses(tree, {relocatedRoot: runtime.root});
  report.processes = {
    count: tree.length,
    executables: [...new Set(tree.map(p => p.executable.replace(runtime.root, '$RUNTIME')))],
    allExecutablesRelocated: classification.allExecutablesRelocated,
    desktopRuntimePaths: classification.desktopRuntimePaths.map(p => p.executable),
  };
  check(classification.desktopRuntimePaths.length === 0, 'an installed-desktop runtime path served this connection');
  check(classification.allExecutablesRelocated, 'not every runtime process runs from the installed release');
  report.nativeHelper = (existsSync(NATIVE_SOCKET) ? socketHolders(sh('lsof', ['-F', 'pc', NATIVE_SOCKET])) : [])
    .map(h => ({pid: h.pid, executable: sh('ps', ['-o', 'comm=', '-p', String(h.pid)]).trim()}))
    .map(h => ({pid: h.pid, executable: h.executable.replace(homedir(), '~'), origin: h.executable.startsWith(runtime.root) ? 'pinned runtime' : 'another installation (not started or stopped by cua)'}));

  const ended = await call('end_task');
  report.task.end = ended.structuredContent;
  check(ended.structuredContent?.status === 'ended' && ended.structuredContent.taskId === taskId, `end_task returned ${JSON.stringify(ended.structuredContent)}`);
  report.task.repeatEnd = (await call('end_task')).structuredContent?.status;
  check(report.task.repeatEnd === 'noop', 'a repeated end_task after success was not a no-op');
  const next = await call('js', {code: 'nodeRepl.write("cua-verify next task")', title: 'cua verify'}, 60_000);
  report.task.nextTaskDiffers = taskOf(next) !== null && taskOf(next) !== taskId;
  check(report.task.nextTaskDiffers, 'work after end_task did not start a new task');
  check((await call('end_task')).structuredContent?.status === 'ended', 'the second task did not end');
} catch (error) {
  problems.push(`verify failed: ${error.message}`);
} finally {
  server.stdin.end();
  const exit = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve(null), 15_000))]);
  if (!exit) { server.kill('SIGTERM'); problems.push('cua serve did not exit within 15 s of EOF'); }
  report.exit = exit ?? await exited;
  check(report.exit.code === 0, `cua serve exited with ${JSON.stringify(report.exit)}`);
  const leftover = (existsSync(runDir) ? readdirSync(runDir) : []).filter(name => !runBefore.includes(name));
  check(leftover.length === 0, `connection directories left under ${runDir}: ${leftover.join(', ')}`);
}

console.log(JSON.stringify(report, null, 1));
process.exitCode = problems.length ? 1 : 0;
